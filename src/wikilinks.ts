export interface WikilinkRef {
	target: string;
	alias: string | null;
	heading: string | null;
	embed: boolean;
	raw: string;
}

const WIKILINK_RE = /(!?)\[\[([^\[\]\n]+?)\]\]/g;

export function parseWikilinks(body: string): WikilinkRef[] {
	const refs: WikilinkRef[] = [];
	for (const m of body.matchAll(WIKILINK_RE)) {
		const embed = m[1] === "!";
		const inner = m[2];
		let target = inner;
		let alias: string | null = null;
		let heading: string | null = null;
		const pipeIdx = target.indexOf("|");
		if (pipeIdx !== -1) {
			alias = target.slice(pipeIdx + 1).trim();
			target = target.slice(0, pipeIdx);
		}
		const hashIdx = target.indexOf("#");
		if (hashIdx !== -1) {
			heading = target.slice(hashIdx + 1).trim();
			target = target.slice(0, hashIdx);
		}
		target = target.trim();
		refs.push({
			target,
			alias,
			heading,
			embed,
			raw: m[0],
		});
	}
	return refs;
}

const ATTACHMENT_EXT = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"svg",
	"webp",
	"avif",
	"bmp",
	"ico",
	"mp3",
	"wav",
	"ogg",
	"flac",
	"m4a",
	"mp4",
	"webm",
	"mov",
	"pdf",
]);

export function looksLikeAttachment(target: string): boolean {
	const dot = target.lastIndexOf(".");
	if (dot === -1) return false;
	const ext = target.slice(dot + 1).toLowerCase();
	return ATTACHMENT_EXT.has(ext);
}

export interface ResolveContext {
	currentDir: string;
	allPaths: string[];
}

export function resolveWikilink(target: string, ctx: ResolveContext): string | null {
	if (!target) return null;
	const normalizedTarget = target.replace(/\\/g, "/");
	const isAttachment = looksLikeAttachment(normalizedTarget);
	const candidates: string[] = [];
	if (normalizedTarget.includes("/")) {
		candidates.push(normalizedTarget);
	} else if (isAttachment) {
		candidates.push(normalizedTarget);
	} else {
		const withMd = normalizedTarget.endsWith(".md") ? normalizedTarget : `${normalizedTarget}.md`;
		if (ctx.currentDir) candidates.push(joinPath(ctx.currentDir, withMd));
		candidates.push(withMd);
	}
	if (!isAttachment && !normalizedTarget.endsWith(".md") && normalizedTarget.includes("/")) {
		candidates.push(`${normalizedTarget}.md`);
	}
	for (const candidate of candidates) {
		const hit = ctx.allPaths.find((p) => p === candidate);
		if (hit) return hit;
	}
	const basename = normalizedTarget.split("/").pop() ?? normalizedTarget;
	const baseWithMd = isAttachment ? basename : basename.endsWith(".md") ? basename : `${basename}.md`;
	const fuzzy = ctx.allPaths.find((p) => {
		const tail = p.split("/").pop();
		return tail === baseWithMd;
	});
	return fuzzy ?? null;
}

function joinPath(dir: string, rel: string): string {
	if (!dir) return rel;
	return `${dir.replace(/\/+$/, "")}/${rel}`;
}
