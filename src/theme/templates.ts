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
		`<script src="/assets/client.js" defer></script>`,
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

export function buildLeftNav(index: VaultIndex, currentPath?: string): string {
	const groups = new Map<string, IndexedNote[]>();
	for (const note of index.visible()) {
		const folder = topLevelFolder(note.path);
		if (!groups.has(folder)) groups.set(folder, []);
		groups.get(folder)!.push(note);
	}
	const orderedFolders = Array.from(groups.keys()).sort((a, b) => {
		if (a === "") return 1;
		if (b === "") return -1;
		return a.localeCompare(b);
	});
	const out: string[] = [];
	for (const folder of orderedFolders) {
		const notes = groups
			.get(folder)!
			.sort((a, b) => a.title.localeCompare(b.title));
		out.push(`<div class="group">`);
		const label = folder === "" ? "Untitled" : folder;
		out.push(`<div class="group-title">${esc(label)}</div>`);
		out.push(`<ul>`);
		for (const note of notes) {
			const active = note.path === currentPath ? ' class="active"' : "";
			out.push(
				`<li><a${active} href="/${note.slug}">${esc(note.title)}</a></li>`,
			);
		}
		out.push(`</ul>`);
		out.push(`</div>`);
	}
	return out.join("");
}

function topLevelFolder(path: string): string {
	const idx = path.indexOf("/");
	return idx === -1 ? "" : path.slice(0, idx);
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
	const stripped = body.replace(/^#.*$/gm, "").replace(/\n+/g, " ").trim();
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
		`<p class="lede">A force-directed view of the vault's wikilinks.</p>`,
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
