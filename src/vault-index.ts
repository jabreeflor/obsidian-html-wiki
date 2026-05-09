import matter from "gray-matter";
import { createHash } from "node:crypto";
import { pathToSlug } from "./slug";
import { looksLikeAttachment, parseWikilinks, resolveWikilink } from "./wikilinks";

export interface IndexedNote {
	path: string;
	slug: string;
	title: string;
	frontmatter: Record<string, unknown>;
	excluded: boolean;
	outlinks: string[];
	embeddedAttachments: string[];
	tags: string[];
	mtime: number;
	contentHash: string;
	body: string;
}

export interface RawNote {
	path: string;
	mtime: number;
	content: string;
}

export interface ExclusionConfig {
	frontmatterKey: string;
	exclusionValue: string | boolean | number;
}

export interface GraphData {
	nodes: { id: string; title: string; tags: string[] }[];
	edges: { source: string; target: string }[];
}

interface PartialNote {
	path: string;
	mtime: number;
	frontmatter: Record<string, unknown>;
	body: string;
	title: string;
	tags: string[];
	rawWikilinks: { target: string; embed: boolean }[];
	contentHash: string;
}

export class VaultIndex {
	private notes = new Map<string, IndexedNote>();
	private partials = new Map<string, PartialNote>();
	private backlinksCache: Map<string, Set<string>> | null = null;
	private graphCache: GraphData | null = null;
	private exclusion: ExclusionConfig;

	constructor(exclusion: ExclusionConfig) {
		this.exclusion = exclusion;
	}

	build(rawNotes: RawNote[]): void {
		this.notes.clear();
		this.partials.clear();
		for (const raw of rawNotes) {
			this.partials.set(raw.path, this.parse(raw));
		}
		this.resolveAll();
	}

	update(raw: RawNote): void {
		this.partials.set(raw.path, this.parse(raw));
		this.resolveAll();
	}

	remove(path: string): void {
		this.partials.delete(path);
		this.notes.delete(path);
		this.resolveAll();
	}

	rename(oldPath: string, newPath: string, raw?: RawNote): void {
		const partial = this.partials.get(oldPath);
		this.partials.delete(oldPath);
		this.notes.delete(oldPath);
		if (raw) {
			this.partials.set(newPath, this.parse(raw));
		} else if (partial) {
			this.partials.set(newPath, { ...partial, path: newPath });
		}
		this.resolveAll();
	}

	get(path: string): IndexedNote | undefined {
		return this.notes.get(path);
	}

	bySlug(slug: string): IndexedNote | undefined {
		const normalized = slug.replace(/^\/+|\/+$/g, "");
		for (const note of this.notes.values()) {
			if (note.excluded) continue;
			if (note.slug === normalized) return note;
		}
		return undefined;
	}

	all(): IndexedNote[] {
		return Array.from(this.notes.values());
	}

	visible(): IndexedNote[] {
		return this.all().filter((n) => !n.excluded);
	}

	allPaths(): string[] {
		return Array.from(this.partials.keys());
	}

	count(): number {
		return this.visible().length;
	}

	totalCount(): number {
		return this.notes.size;
	}

	excludedCount(): number {
		return this.all().filter((n) => n.excluded).length;
	}

	backlinksFor(path: string): IndexedNote[] {
		const cache = this.ensureBacklinksCache();
		const sources = cache.get(path);
		if (!sources) return [];
		const out: IndexedNote[] = [];
		for (const src of sources) {
			const note = this.notes.get(src);
			if (note && !note.excluded) out.push(note);
		}
		return out.sort((a, b) => a.title.localeCompare(b.title));
	}

	allTags(): { tag: string; count: number }[] {
		const tagMap = new Map<string, number>();
		for (const note of this.visible()) {
			for (const tag of note.tags) {
				tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
			}
		}
		return Array.from(tagMap.entries())
			.map(([tag, count]) => ({ tag, count }))
			.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
	}

	notesByTag(tag: string): IndexedNote[] {
		return this.visible()
			.filter((n) => n.tags.includes(tag))
			.sort((a, b) => a.title.localeCompare(b.title));
	}

	graphData(): GraphData {
		if (this.graphCache) return this.graphCache;
		const visible = this.visible();
		const visibleSet = new Set(visible.map((n) => n.path));
		const nodes = visible.map((n) => ({ id: n.path, title: n.title, tags: n.tags }));
		const edges: { source: string; target: string }[] = [];
		const seen = new Set<string>();
		for (const note of visible) {
			for (const target of note.outlinks) {
				if (!visibleSet.has(target)) continue;
				const key = `${note.path}->${target}`;
				if (seen.has(key)) continue;
				seen.add(key);
				edges.push({ source: note.path, target });
			}
		}
		this.graphCache = { nodes, edges };
		return this.graphCache;
	}

	updateExclusionConfig(config: ExclusionConfig): void {
		this.exclusion = config;
		this.resolveAll();
	}

	private parse(raw: RawNote): PartialNote {
		const parsed = matter(raw.content);
		const frontmatter = (parsed.data ?? {}) as Record<string, unknown>;
		const body = parsed.content;
		const title = extractTitle(body, raw.path);
		const tags = extractTags(frontmatter, body);
		const wlinks = parseWikilinks(body).map((w) => ({ target: w.target, embed: w.embed }));
		const contentHash = createHash("sha1")
			.update(JSON.stringify(frontmatter))
			.update(" ")
			.update(body)
			.digest("hex");
		return {
			path: raw.path,
			mtime: raw.mtime,
			frontmatter,
			body,
			title,
			tags,
			rawWikilinks: wlinks,
			contentHash,
		};
	}

	private resolveAll(): void {
		this.backlinksCache = null;
		this.graphCache = null;
		const allPaths = Array.from(this.partials.keys());
		const next = new Map<string, IndexedNote>();
		for (const partial of this.partials.values()) {
			const dir = directoryOf(partial.path);
			const outlinks: string[] = [];
			const embeds: string[] = [];
			for (const link of partial.rawWikilinks) {
				const resolved = resolveWikilink(link.target, { currentDir: dir, allPaths });
				if (link.embed) {
					if (resolved) {
						embeds.push(resolved);
					} else if (looksLikeAttachment(link.target)) {
						embeds.push(link.target);
					}
				} else {
					if (resolved && resolved.endsWith(".md")) {
						if (!outlinks.includes(resolved)) outlinks.push(resolved);
					}
				}
			}
			const excluded = this.computeExcluded(partial.frontmatter);
			const note: IndexedNote = {
				path: partial.path,
				slug: pathToSlug(partial.path),
				title: partial.title,
				frontmatter: partial.frontmatter,
				excluded,
				outlinks,
				embeddedAttachments: embeds,
				tags: partial.tags,
				mtime: partial.mtime,
				contentHash: partial.contentHash,
				body: partial.body,
			};
			next.set(partial.path, note);
		}
		this.notes = next;
	}

	private computeExcluded(frontmatter: Record<string, unknown>): boolean {
		const value = frontmatter[this.exclusion.frontmatterKey];
		if (value === undefined) return false;
		const expected = this.exclusion.exclusionValue;
		if (typeof value === "boolean" && typeof expected === "boolean") return value === expected;
		if (typeof value === "string" && typeof expected === "string") return value === expected;
		if (typeof value === "number" && typeof expected === "number") return value === expected;
		return String(value) === String(expected);
	}

	private ensureBacklinksCache(): Map<string, Set<string>> {
		if (this.backlinksCache) return this.backlinksCache;
		const cache = new Map<string, Set<string>>();
		for (const note of this.notes.values()) {
			if (note.excluded) continue;
			for (const target of note.outlinks) {
				if (!cache.has(target)) cache.set(target, new Set());
				cache.get(target)!.add(note.path);
			}
		}
		this.backlinksCache = cache;
		return cache;
	}
}

function directoryOf(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx === -1 ? "" : path.slice(0, idx);
}

function extractTitle(body: string, path: string): string {
	const lines = body.split(/\r?\n/);
	for (const line of lines) {
		const m = /^#\s+(.+?)\s*$/.exec(line);
		if (m) return m[1].trim();
	}
	const basename = path.split("/").pop() ?? path;
	return basename.replace(/\.md$/i, "");
}

function extractTags(frontmatter: Record<string, unknown>, body: string): string[] {
	const out = new Set<string>();
	const fmTags = frontmatter["tags"];
	if (Array.isArray(fmTags)) {
		for (const t of fmTags) {
			if (typeof t === "string") out.add(normalizeTag(t));
		}
	} else if (typeof fmTags === "string") {
		for (const t of fmTags.split(/[,\s]+/)) {
			if (t) out.add(normalizeTag(t));
		}
	}
	const codeRe = /```[\s\S]*?```|`[^`]*`/g;
	const stripped = body.replace(codeRe, "");
	const inlineRe = /(^|[\s(])#([A-Za-z0-9_][A-Za-z0-9_/\-]*)/g;
	for (const m of stripped.matchAll(inlineRe)) {
		out.add(normalizeTag(m[2]));
	}
	return Array.from(out).sort();
}

function normalizeTag(tag: string): string {
	return tag.replace(/^#+/, "").trim();
}
