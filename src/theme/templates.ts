import { IndexedNote, VaultIndex } from "../vault-index";
import { Renderer, RenderResult, TocEntry } from "../renderer";
import { slugify } from "../slug";
import {
	ICON_GRAPH,
	ICON_HASH,
	ICON_HOME,
	ICON_LINK,
	ICON_SEARCH,
	ICON_TAGS,
} from "./icons";

export interface SiteContext {
	vaultName: string;
	index: VaultIndex;
}

const FONTS_HREF =
	"https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";

interface PageShellOpts {
	title: string;
	site: SiteContext;
	currentPath?: string;
	bodyClass?: string;
	leftNav: string;
	rightAside: string;
	main: string;
	headExtras?: string;
}

export function pageShell(opts: PageShellOpts): string {
	const { title, site, bodyClass, leftNav, rightAside, main, headExtras } = opts;
	const themeClass = `theme-quiet-reference ${bodyClass ?? ""}`.trim();
	return [
		`<!doctype html>`,
		`<html lang="en">`,
		`<head>`,
		`<meta charset="utf-8">`,
		`<title>${esc(title)} — ${esc(site.vaultName)}</title>`,
		`<meta name="viewport" content="width=device-width,initial-scale=1">`,
		`<link rel="preconnect" href="https://fonts.googleapis.com">`,
		`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
		`<link rel="stylesheet" href="${FONTS_HREF}">`,
		`<link rel="stylesheet" href="/assets/katex.css">`,
		`<link rel="stylesheet" href="/assets/theme.css">`,
		headExtras ?? "",
		`</head>`,
		`<body class="${themeClass}">`,
		topBar(site),
		`<main class="layout">`,
		`<aside class="nav">${leftNav}</aside>`,
		main,
		`<aside class="toc">${rightAside}</aside>`,
		`</main>`,
		`<script type="module" src="/assets/main.js"></script>`,
		`</body>`,
		`</html>`,
	].join("\n");
}

export function topBar(site: SiteContext): string {
	return [
		`<header class="top">`,
		`<a class="brand" href="/"><span class="brand-name">${esc(site.vaultName)}</span><span class="dot">.</span></a>`,
		`<form class="search" role="search" action="/search/" method="get">`,
		`<span class="search-icon" aria-hidden="true">${ICON_SEARCH}</span>`,
		`<input id="site-search" type="search" name="q" placeholder="Search the wiki" autocomplete="off">`,
		`<span class="kbd" aria-hidden="true">⌘ K</span>`,
		`</form>`,
		`<nav class="top-nav">`,
		`<a href="/" class="top-nav-link"><span class="ico" aria-hidden="true">${ICON_HOME}</span><span>Index</span></a>`,
		`<a href="/tags/" class="top-nav-link"><span class="ico" aria-hidden="true">${ICON_TAGS}</span><span>Tags</span></a>`,
		`<a href="/graph/" class="top-nav-link"><span class="ico" aria-hidden="true">${ICON_GRAPH}</span><span>Graph</span></a>`,
		`</nav>`,
		`</header>`,
	].join("");
}

interface FolderNode {
	name: string;
	fullPath: string;
	subfolders: Map<string, FolderNode>;
	notes: IndexedNote[];
}

const NAV_FOLDER_LIMIT = 20;
const NAV_FOLDER_THRESHOLD = 40;
const NAV_RECENT_COUNT = 10;

const FOLDER_ICON_SYMBOL =
	'<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="nav-folder-chevron" viewBox="0 0 10 10"><path d="M3 2 L7 5 L3 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol></svg>';

const FOLDER_ICON_USE =
	'<svg class="folder-icon" width="10" height="10" aria-hidden="true"><use href="#nav-folder-chevron"/></svg>';

export function buildLeftNav(index: VaultIndex, currentPath?: string): string {
	const visible = index.visible();
	const root = buildFolderTree(visible);
	const openFolders = openChainFor(currentPath);
	const recents = visible
		.slice()
		.sort((a, b) => b.mtime - a.mtime)
		.slice(0, NAV_RECENT_COUNT);

	const out: string[] = [];
	out.push(FOLDER_ICON_SYMBOL);
	out.push(
		`<input class="nav-filter" id="nav-filter" type="search" placeholder="Filter notes…" autocomplete="off">`,
	);
	out.push(`<div class="nav-recent">`);
	out.push(`<div class="group-title">Recent</div>`);
	out.push(`<ul>`);
	for (const note of recents) {
		const active = note.path === currentPath ? ' class="active"' : "";
		out.push(
			`<li><a${active} href="/${note.slug}">${esc(note.title)}</a></li>`,
		);
	}
	out.push(`</ul>`);
	out.push(`</div>`);
	out.push(`<hr class="nav-divider">`);
	out.push(`<div class="nav-tree">`);
	renderFolderChildren(root, currentPath, openFolders, out, /*depth*/ 0);
	out.push(`</div>`);
	return out.join("");
}

export function renderNavFolderBody(
	index: VaultIndex,
	folderPath: string,
): string | null {
	const root = buildFolderTree(index.visible());
	const node = findFolder(root, folderPath);
	if (!node) return null;
	const out: string[] = [];
	// Empty open set: subfolders ship as closed stubs; only this folder's
	// immediate notes + a stubbed <details> per direct child are emitted.
	renderFolderBodyContents(node, undefined, new Set(), out);
	return out.join("");
}

function findFolder(root: FolderNode, fullPath: string): FolderNode | null {
	if (fullPath === "") return root;
	const parts = fullPath.split("/");
	let cursor: FolderNode | undefined = root;
	for (const part of parts) {
		cursor = cursor.subfolders.get(part);
		if (!cursor) return null;
	}
	return cursor;
}

function buildFolderTree(notes: IndexedNote[]): FolderNode {
	const root: FolderNode = {
		name: "",
		fullPath: "",
		subfolders: new Map(),
		notes: [],
	};
	for (const note of notes) {
		const parts = note.path.split("/");
		const fileName = parts.pop()!;
		void fileName;
		let cursor = root;
		const acc: string[] = [];
		for (const part of parts) {
			acc.push(part);
			let child = cursor.subfolders.get(part);
			if (!child) {
				child = {
					name: part,
					fullPath: acc.join("/"),
					subfolders: new Map(),
					notes: [],
				};
				cursor.subfolders.set(part, child);
			}
			cursor = child;
		}
		cursor.notes.push(note);
	}
	return root;
}

function openChainFor(currentPath: string | undefined): Set<string> {
	const open = new Set<string>();
	if (!currentPath) return open;
	const parts = currentPath.split("/");
	parts.pop();
	const acc: string[] = [];
	for (const part of parts) {
		acc.push(part);
		open.add(acc.join("/"));
	}
	return open;
}

function renderFolderChildren(
	node: FolderNode,
	currentPath: string | undefined,
	openFolders: Set<string>,
	out: string[],
	depth: number,
): void {
	const subfolders = Array.from(node.subfolders.values()).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	for (const sub of subfolders) {
		renderFolder(sub, currentPath, openFolders, out);
	}
	if (node.notes.length) {
		const sortedNotes = node.notes
			.slice()
			.sort((a, b) => a.title.localeCompare(b.title));
		const label = depth === 0 ? "Untitled" : null;
		if (label) out.push(`<div class="group-title">${esc(label)}</div>`);
		renderNoteListUL(node, sortedNotes, currentPath, out);
	}
}

function renderFolder(
	node: FolderNode,
	currentPath: string | undefined,
	openFolders: Set<string>,
	out: string[],
): void {
	const isOpen = openFolders.has(node.fullPath);
	const totalDescendants = countDescendants(node);
	const folderAttrs = `class="nav-folder" data-folder="${esc(node.fullPath)}" data-count="${totalDescendants}"`;
	if (!isOpen) {
		out.push(
			`<details ${folderAttrs}><summary>${FOLDER_ICON_USE}<span class="folder-name">${esc(node.name)}</span></summary></details>`,
		);
		return;
	}
	out.push(`<details open ${folderAttrs}>`);
	out.push(
		`<summary>${FOLDER_ICON_USE}<span class="folder-name">${esc(node.name)}</span></summary>`,
	);
	renderFolderBodyContents(node, currentPath, openFolders, out);
	out.push(`</details>`);
}

function renderFolderBodyContents(
	node: FolderNode,
	currentPath: string | undefined,
	openFolders: Set<string>,
	out: string[],
): void {
	const hasSubfolders = node.subfolders.size > 0;
	const hasNotes = node.notes.length > 0;
	if (!hasSubfolders && !hasNotes) return;
	out.push(`<div class="nav-folder-body">`);

	const sortedSubfolders = Array.from(node.subfolders.values()).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	for (const sub of sortedSubfolders) {
		renderFolder(sub, currentPath, openFolders, out);
	}

	if (hasNotes) {
		const sortedNotes = node.notes
			.slice()
			.sort((a, b) => a.title.localeCompare(b.title));
		renderNoteListUL(node, sortedNotes, currentPath, out);
	}

	out.push(`</div>`);
}

function renderNoteListUL(
	node: FolderNode,
	sortedNotes: IndexedNote[],
	currentPath: string | undefined,
	out: string[],
): void {
	const noteCount = sortedNotes.length;
	const truncated = noteCount > NAV_FOLDER_THRESHOLD;
	const visible = truncated
		? sortedNotes.slice(0, NAV_FOLDER_LIMIT)
		: sortedNotes;
	out.push(`<ul>`);
	for (const note of visible) {
		const active = note.path === currentPath ? ' class="active"' : "";
		out.push(
			`<li><a${active} href="/${note.slug}">${esc(note.title)}</a></li>`,
		);
	}
	if (truncated) {
		const remaining = noteCount - NAV_FOLDER_LIMIT;
		const folderHref = `/folder/${node.fullPath
			.split("/")
			.map(encodeURIComponent)
			.join("/")}`;
		out.push(
			`<li class="more"><a href="${folderHref}">+ ${remaining} more in ${esc(node.name)}</a></li>`,
		);
	}
	out.push(`</ul>`);
}

function countDescendants(node: FolderNode): number {
	let n = node.notes.length;
	for (const sub of node.subfolders.values()) n += countDescendants(sub);
	return n;
}

export function notePage(
	note: IndexedNote,
	site: SiteContext,
	renderer: Renderer,
): string {
	const result = renderer.render(note, site.index);
	const left = buildLeftNav(site.index, note.path);
	const right = buildRightAside(note, result.toc, site.index);
	const main = noteArticle(note, result, site);
	return pageShell({
		title: note.title,
		site,
		currentPath: note.path,
		leftNav: left,
		rightAside: right,
		main,
	});
}

function noteArticle(
	note: IndexedNote,
	result: RenderResult,
	site: SiteContext,
): string {
	const breadcrumbs = breadcrumbsFor(note, site);
	const updatedTs = note.frontmatter["updated"];
	const updated =
		typeof updatedTs === "string"
			? updatedTs
			: formatHumanDate(note.mtime);
	const tagsHtml = note.tags.length
		? note.tags
				.map(
					(t) =>
						`<a class="pill" href="/tags/${encodeURIComponent(t)}">#${esc(t)}</a>`,
				)
				.join("")
		: "";
	const reading = readingMinutes(note.body);
	const metaSuffix = `<span class="updated">Updated ${esc(updated)}${reading ? ` · ${reading} min` : ""}</span>`;
	return [
		`<article>`,
		`<div class="crumbs">${breadcrumbs}</div>`,
		`<h1>${esc(note.title)}</h1>`,
		descriptionLede(note),
		`<div class="meta-row">`,
		tagsHtml,
		metaSuffix,
		`</div>`,
		result.html,
		`</article>`,
	].join("");
}

function descriptionLede(note: IndexedNote): string {
	const desc = note.frontmatter["description"];
	if (typeof desc !== "string" || !desc.trim()) return "";
	return `<p class="lede">${esc(desc.trim())}</p>`;
}

function breadcrumbsFor(note: IndexedNote, site: SiteContext): string {
	const parts = note.path.replace(/\.md$/i, "").split("/");
	const tail = parts.pop() ?? "";
	const segments: string[] = [
		`<a href="/">${esc(site.vaultName)}</a>`,
	];
	for (const p of parts) {
		segments.push(`<span>/</span><span>${esc(p)}</span>`);
	}
	segments.push(`<span>/</span><span>${esc(tail)}</span>`);
	return segments.join(" ");
}

function buildRightAside(
	note: IndexedNote,
	toc: TocEntry[],
	index: VaultIndex,
): string {
	const tocList = toc.length
		? toc
				.map(
					(e) =>
						`<li class="lvl-${e.level}"><a href="#${esc(e.id)}">${esc(e.text)}</a></li>`,
				)
				.join("")
		: "";
	const tocBlock = tocList
		? `<h5>On this page</h5><ul>${tocList}</ul>`
		: "";
	const backlinks = index.backlinksFor(note.path);
	const blocks = backlinks
		.map((b) => {
			const excerpt = backlinkExcerpt(b.body, note.title);
			return [
				`<div class="item">`,
				`<a class="title" href="/${b.slug}">${esc(b.title)}</a>`,
				excerpt ? `<div class="excerpt">${esc(excerpt)}</div>` : "",
				`</div>`,
			].join("");
		})
		.join("");
	const backBlock = backlinks.length
		? `<h5>Linked from</h5><div class="backlinks">${blocks}</div>`
		: "";
	const graphThumb = `<div class="graph-thumb"><span class="label">Local graph</span></div>`;
	return `${tocBlock}${backBlock}${graphThumb}`;
}

function backlinkExcerpt(body: string, targetTitle: string): string {
	const stripped = body
		.replace(/^---[\s\S]*?\n---\n/, "")
		.replace(/^#.*$/gm, "")
		.replace(/!\[\[[^\]]*\]\]/g, "")
		.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => alias ?? target)
		.replace(/`[^`]*`/g, "")
		.replace(/\n+/g, " ")
		.trim();
	const idx = stripped.toLowerCase().indexOf(targetTitle.toLowerCase());
	if (idx === -1) return stripped.slice(0, 140);
	const start = Math.max(0, idx - 60);
	const end = Math.min(stripped.length, idx + targetTitle.length + 80);
	const slice = stripped.slice(start, end);
	return (start > 0 ? "…" : "") + slice + (end < stripped.length ? "…" : "");
}

export function homePage(site: SiteContext): string {
	const visible = site.index.visible();
	const recents = visible
		.slice()
		.sort((a, b) => b.mtime - a.mtime)
		.slice(0, 10);
	const tags = site.index.allTags().slice(0, 30);
	const main = [
		`<article class="home">`,
		`<h1>${esc(site.vaultName)}</h1>`,
		`<p class="lede">A live wiki view of ${visible.length} note${visible.length === 1 ? "" : "s"}.</p>`,
		`<section class="recents">`,
		`<h2>Recent notes</h2>`,
		`<ul class="recent-list">`,
		...recents.map(
			(n) =>
				`<li><a class="wikilink" href="/${n.slug}">${esc(n.title)}</a> <span class="muted">${esc(formatHumanDate(n.mtime))}</span></li>`,
		),
		`</ul>`,
		`</section>`,
		tags.length
			? `<section class="tagcloud"><h2>Tags</h2><div class="tagcloud-list">${tags
					.map(
						(t) =>
							`<a class="pill" href="/tags/${encodeURIComponent(t.tag)}">#${esc(t.tag)} <span class="count">${t.count}</span></a>`,
					)
					.join("")}</div></section>`
			: "",
		`</article>`,
	].join("");
	return pageShell({
		title: "Home",
		site,
		bodyClass: "page-home",
		leftNav: buildLeftNav(site.index),
		rightAside: "",
		main,
	});
}

export function tagsIndexPage(site: SiteContext): string {
	const tags = site.index.allTags();
	const main = [
		`<article>`,
		`<div class="crumbs"><a href="/">${esc(site.vaultName)}</a> <span>/</span> <span>Tags</span></div>`,
		`<h1>Tags</h1>`,
		`<p class="lede">${tags.length} tag${tags.length === 1 ? "" : "s"} in this vault.</p>`,
		`<ul class="tag-list">`,
		...tags.map(
			(t) =>
				`<li><a class="pill" href="/tags/${encodeURIComponent(t.tag)}">#${esc(t.tag)}</a> <span class="count">${t.count}</span></li>`,
		),
		`</ul>`,
		`</article>`,
	].join("");
	return pageShell({
		title: "Tags",
		site,
		bodyClass: "page-tags",
		leftNav: buildLeftNav(site.index),
		rightAside: "",
		main,
	});
}

export function folderIndexPage(
	site: SiteContext,
	folderPath: string,
): string | null {
	const root = buildFolderTree(site.index.visible());
	const node = findFolder(root, folderPath);
	if (!node || folderPath === "") return null;
	const notes = node.notes
		.slice()
		.sort((a, b) => a.title.localeCompare(b.title));
	const subfolders = Array.from(node.subfolders.values()).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	const parts = folderPath.split("/");
	const folderName = parts[parts.length - 1];
	const acc: string[] = [];
	const crumbSegments: string[] = [
		`<a href="/">${esc(site.vaultName)}</a>`,
	];
	for (let i = 0; i < parts.length; i++) {
		acc.push(parts[i]);
		const isLast = i === parts.length - 1;
		const href = `/folder/${acc.map(encodeURIComponent).join("/")}`;
		crumbSegments.push(`<span>/</span>`);
		crumbSegments.push(
			isLast
				? `<span>${esc(parts[i])}</span>`
				: `<a href="${href}">${esc(parts[i])}</a>`,
		);
	}
	const total = notes.length;
	const subList = subfolders.length
		? [
			`<section class="folder-subfolders">`,
			`<h2>Subfolders</h2>`,
			`<ul class="folder-list">`,
			...subfolders.map((sub) => {
				const href = `/folder/${sub.fullPath
					.split("/")
					.map(encodeURIComponent)
					.join("/")}`;
				const count = countDescendants(sub);
				return `<li><a class="wikilink" href="${href}">${esc(sub.name)}/</a> <span class="muted">${count} note${count === 1 ? "" : "s"}</span></li>`;
			}),
			`</ul>`,
			`</section>`,
		].join("")
		: "";
	const noteList = notes.length
		? [
			`<section class="folder-notes">`,
			`<h2>Notes</h2>`,
			`<ul class="folder-note-list">`,
			...notes.map(
				(n) =>
					`<li><a class="wikilink" href="/${n.slug}">${esc(n.title)}</a> <span class="muted">${esc(formatHumanDate(n.mtime))}</span></li>`,
			),
			`</ul>`,
			`</section>`,
		].join("")
		: "";
	const empty = !subfolders.length && !notes.length
		? `<p class="lede">This folder is empty.</p>`
		: "";
	const main = [
		`<article class="folder-page">`,
		`<div class="crumbs">${crumbSegments.join(" ")}</div>`,
		`<h1>${esc(folderName)}/</h1>`,
		`<p class="lede">${total} note${total === 1 ? "" : "s"} directly in this folder${subfolders.length ? `, plus ${subfolders.length} subfolder${subfolders.length === 1 ? "" : "s"}` : ""}.</p>`,
		empty,
		subList,
		noteList,
		`</article>`,
	].join("");
	return pageShell({
		title: `${folderName}/`,
		site,
		bodyClass: "page-folder",
		leftNav: buildLeftNav(site.index),
		rightAside: "",
		main,
	});
}

export function tagPage(site: SiteContext, tag: string): string {
	const notes = site.index.notesByTag(tag);
	const main = [
		`<article>`,
		`<div class="crumbs"><a href="/">${esc(site.vaultName)}</a> <span>/</span> <a href="/tags/">Tags</a> <span>/</span> <span>#${esc(tag)}</span></div>`,
		`<h1><span class="hash" aria-hidden="true">${ICON_HASH}</span>#${esc(tag)}</h1>`,
		`<p class="lede">${notes.length} note${notes.length === 1 ? "" : "s"}.</p>`,
		`<ul class="tag-notes">`,
		...notes.map(
			(n) =>
				`<li><a class="wikilink" href="/${n.slug}">${esc(n.title)}</a> <span class="muted">${esc(formatHumanDate(n.mtime))}</span></li>`,
		),
		`</ul>`,
		`</article>`,
	].join("");
	return pageShell({
		title: `#${tag}`,
		site,
		bodyClass: "page-tag",
		leftNav: buildLeftNav(site.index),
		rightAside: "",
		main,
	});
}

export function graphPage(site: SiteContext): string {
	const main = [
		`<article class="graph-page">`,
		`<div class="crumbs"><a href="/">${esc(site.vaultName)}</a> <span>/</span> <span>Graph</span></div>`,
		`<h1>Graph</h1>`,
		`<p class="lede">A force-directed view of the vault's wikilinks. Scroll or pinch to zoom, drag to pan, drag a node to pin it.</p>`,
		`<div id="graph-root" data-src="/api/graph.json"></div>`,
		`</article>`,
	].join("");
	return pageShell({
		title: "Graph",
		site,
		bodyClass: "page-graph",
		leftNav: buildLeftNav(site.index),
		rightAside: "",
		main,
	});
}

export function searchPage(site: SiteContext): string {
	const main = [
		`<article class="search-page">`,
		`<div class="crumbs"><a href="/">${esc(site.vaultName)}</a> <span>/</span> <span>Search</span></div>`,
		`<h1>Search</h1>`,
		`<p class="lede">Type to filter ${site.index.count()} notes.</p>`,
		`<input id="search-input" type="search" placeholder="Search the wiki" autofocus>`,
		`<div id="search-results" data-src="/api/search-index.json"></div>`,
		`</article>`,
	].join("");
	return pageShell({
		title: "Search",
		site,
		bodyClass: "page-search",
		leftNav: buildLeftNav(site.index),
		rightAside: "",
		main,
	});
}

export function notFoundPage(site: SiteContext, requested: string): string {
	const main = [
		`<article class="not-found">`,
		`<h1>Not found</h1>`,
		`<p class="lede">No note at <code>${esc(requested)}</code>.</p>`,
		`<p><span class="ico" aria-hidden="true">${ICON_LINK}</span> <a class="wikilink" href="/">Return home</a>.</p>`,
		`</article>`,
	].join("");
	return pageShell({
		title: "Not found",
		site,
		bodyClass: "page-404",
		leftNav: buildLeftNav(site.index),
		rightAside: "",
		main,
	});
}

export function tagSlug(tag: string): string {
	return slugify(tag);
}

function readingMinutes(body: string): number {
	const words = body.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
	if (words === 0) return 0;
	return Math.max(1, Math.round(words / 220));
}

function formatHumanDate(input: number | string): string {
	const ts = typeof input === "string" ? Date.parse(input) : input;
	if (!Number.isFinite(ts)) return typeof input === "string" ? input : "";
	const d = new Date(ts);
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	const dd = String(d.getDate()).padStart(2, "0");
	return `${dd} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
