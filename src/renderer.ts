import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import katex from "katex";
import { IndexedNote, VaultIndex } from "./vault-index";
import { looksLikeAttachment, resolveWikilink } from "./wikilinks";
import { slugify } from "./slug";

export interface TocEntry {
	level: number;
	id: string;
	text: string;
}

export interface RenderResult {
	html: string;
	toc: TocEntry[];
	title: string;
	frontmatter: Record<string, unknown>;
}

const CALLOUT_KINDS = new Set([
	"note",
	"info",
	"tip",
	"hint",
	"important",
	"success",
	"check",
	"done",
	"question",
	"help",
	"faq",
	"warning",
	"caution",
	"attention",
	"failure",
	"fail",
	"missing",
	"danger",
	"error",
	"bug",
	"example",
	"quote",
	"cite",
	"abstract",
	"summary",
	"tldr",
	"todo",
]);

const ATTACHMENT_HOSTED_PREFIX = "/attachments/";

export function buildMarkdown(): MarkdownIt {
	const md = new MarkdownIt({
		html: false,
		linkify: true,
		typographer: true,
		breaks: false,
	});
	md.use(anchor, { slugify: (s: string) => slugify(s), permalink: false });
	md.use(footnote);
	md.use(taskLists, { enabled: true, label: false });

	registerWikilinkRule(md);
	registerCalloutRule(md);
	registerKatexRules(md);
	customizeFenceRender(md);
	return md;
}

export class Renderer {
	private md: MarkdownIt;

	constructor() {
		this.md = buildMarkdown();
	}

	render(note: IndexedNote, index: VaultIndex): RenderResult {
		const env: RenderEnv = {
			note,
			index,
			currentDir: directoryOf(note.path),
			allPaths: index.allPaths(),
			toc: [],
		};
		const tokens = this.md.parse(note.body, env);
		stripLeadingH1(tokens);
		collectToc(tokens, env.toc);
		const html = this.md.renderer.render(tokens, this.md.options, env);
		return {
			html,
			toc: env.toc,
			title: note.title,
			frontmatter: note.frontmatter,
		};
	}
}

interface RenderEnv {
	note: IndexedNote;
	index: VaultIndex;
	currentDir: string;
	allPaths: string[];
	toc: TocEntry[];
}

function directoryOf(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx === -1 ? "" : path.slice(0, idx);
}

function registerWikilinkRule(md: MarkdownIt): void {
	const wikilinkRule = (state: StateInline, silent: boolean): boolean => {
		const src = state.src;
		const start = state.pos;
		if (src.charCodeAt(start) === 0x21 /* ! */) {
			if (src.charCodeAt(start + 1) !== 0x5b || src.charCodeAt(start + 2) !== 0x5b) return false;
		} else if (src.charCodeAt(start) === 0x5b /* [ */) {
			if (src.charCodeAt(start + 1) !== 0x5b) return false;
		} else {
			return false;
		}
		const isEmbed = src.charCodeAt(start) === 0x21;
		const openLen = isEmbed ? 3 : 2;
		const closeIdx = src.indexOf("]]", start + openLen);
		if (closeIdx === -1) return false;
		const inner = src.slice(start + openLen, closeIdx);
		if (inner.includes("\n") || inner.includes("[[")) return false;
		if (silent) {
			state.pos = closeIdx + 2;
			return true;
		}
		const { target, alias, heading } = splitWikilink(inner);
		const token = state.push(isEmbed ? "wikiembed" : "wikilink", "", 0);
		token.meta = { target, alias, heading };
		state.pos = closeIdx + 2;
		return true;
	};
	md.inline.ruler.before("link", "wikilink", wikilinkRule);

	md.renderer.rules["wikilink"] = (tokens, idx, _opts, env: RenderEnv) => {
		const meta = tokens[idx].meta as { target: string; alias: string | null; heading: string | null };
		const resolved = resolveWikilink(meta.target, {
			currentDir: env.currentDir,
			allPaths: env.allPaths,
		});
		const targetNote = resolved ? env.index.get(resolved) : undefined;
		const visible = targetNote && !targetNote.excluded ? targetNote : undefined;
		const display = meta.alias ?? (visible ? visible.title : meta.target);
		if (!visible) {
			return `<a class="wikilink unresolved" data-target="${esc(meta.target)}">${esc(display)}</a>`;
		}
		const href = `/${visible.slug}${meta.heading ? `#${slugify(meta.heading)}` : ""}`;
		return `<a class="wikilink" href="${href}">${esc(display)}</a>`;
	};

	md.renderer.rules["wikiembed"] = (tokens, idx, _opts, env: RenderEnv) => {
		const meta = tokens[idx].meta as { target: string; alias: string | null };
		const resolved = resolveWikilink(meta.target, {
			currentDir: env.currentDir,
			allPaths: env.allPaths,
		});
		if (resolved && looksLikeAttachment(resolved)) {
			const alt = meta.alias ?? meta.target;
			return `<img class="embed" src="${ATTACHMENT_HOSTED_PREFIX}${encodeAttachmentPath(resolved)}" alt="${esc(alt)}">`;
		}
		if (!resolved && looksLikeAttachment(meta.target)) {
			const alt = meta.alias ?? meta.target;
			return `<img class="embed" src="${ATTACHMENT_HOSTED_PREFIX}${encodeAttachmentPath(meta.target)}" alt="${esc(alt)}">`;
		}
		const targetNote = resolved ? env.index.get(resolved) : undefined;
		if (!targetNote || targetNote.excluded) {
			return `<aside class="transclude unresolved" data-target="${esc(meta.target)}"><span class="transclude-title">${esc(meta.target)}</span></aside>`;
		}
		const href = `/${targetNote.slug}`;
		return [
			`<aside class="transclude" data-source="${esc(targetNote.path)}">`,
			`<a class="transclude-title" href="${href}">${esc(targetNote.title)}</a>`,
			`<div class="transclude-body">${truncatedExcerpt(targetNote.body)}</div>`,
			`</aside>`,
		].join("");
	};
}

function splitWikilink(inner: string): { target: string; alias: string | null; heading: string | null } {
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
	return { target: target.trim(), alias, heading };
}

const CALLOUT_HEADER_RE = /^>\s*\[!([A-Za-z]+)\]([+-]?)\s*(.*)$/;
const QUOTE_LINE_RE = /^>\s?(.*)$/;

function registerCalloutRule(md: MarkdownIt): void {
	const calloutRule = (state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean => {
		const lineStart = state.bMarks[startLine] + state.tShift[startLine];
		const lineEnd = state.eMarks[startLine];
		const firstLine = state.src.slice(lineStart, lineEnd);
		const m = firstLine.match(CALLOUT_HEADER_RE);
		if (!m) return false;
		if (silent) return true;
		const kindRaw = m[1].toLowerCase();
		const kind = CALLOUT_KINDS.has(kindRaw) ? kindRaw : "note";
		const fold = m[2];
		const titleText = m[3].trim();
		const bodyLines: string[] = [];
		let line = startLine + 1;
		while (line < endLine) {
			const ls = state.bMarks[line] + state.tShift[line];
			const le = state.eMarks[line];
			const text = state.src.slice(ls, le);
			const qm = text.match(QUOTE_LINE_RE);
			if (!qm) break;
			bodyLines.push(qm[1]);
			line++;
		}
		const open = state.push("callout_open", "aside", 1);
		open.attrs = [
			["class", `callout callout-${kind}`],
			["data-kind", kind],
		];
		if (fold) open.attrs.push(["data-fold", fold]);
		open.markup = ">";
		open.block = true;
		open.map = [startLine, line];

		const labelToken = state.push("callout_label", "div", 0);
		labelToken.attrs = [["class", "callout-label"]];
		labelToken.content = titleText || titleCase(kindRaw);
		labelToken.markup = "";
		labelToken.block = true;

		if (bodyLines.length > 0) {
			state.push("callout_body_open", "div", 1).attrs = [["class", "callout-body"]];
			const innerSrc = bodyLines.join("\n");
			const childTokens: Token[] = [];
			md.block.parse(innerSrc, md, state.env, childTokens);
			for (const t of childTokens) state.tokens.push(t);
			state.push("callout_body_close", "div", -1);
		}

		state.push("callout_close", "aside", -1);
		state.line = line;
		return true;
	};
	md.block.ruler.before("blockquote", "callout", calloutRule, {
		alt: ["paragraph", "reference", "blockquote", "list"],
	});

	md.renderer.rules["callout_label"] = (tokens, idx) => {
		const t = tokens[idx];
		const text = t.content;
		return `<div class="callout-label"><span class="callout-icon" aria-hidden="true"></span><span class="callout-title">${esc(text)}</span></div>\n`;
	};
}

function titleCase(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

const KATEX_BLOCK_INLINE_RE = /^\$\$([\s\S]+?)\$\$/;

function registerKatexRules(md: MarkdownIt): void {
	const inlineRule = (state: StateInline, silent: boolean): boolean => {
		const start = state.pos;
		if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false;
		if (state.src.charCodeAt(start + 1) === 0x24) return false;
		const before = start > 0 ? state.src.charCodeAt(start - 1) : -1;
		if (before === 0x5c /* \ */) return false;
		let i = start + 1;
		while (i < state.src.length) {
			const c = state.src.charCodeAt(i);
			if (c === 0x24 && state.src.charCodeAt(i - 1) !== 0x5c) break;
			if (c === 0x0a) return false;
			i++;
		}
		if (i >= state.src.length) return false;
		const expr = state.src.slice(start + 1, i).trim();
		if (!expr) return false;
		if (silent) {
			state.pos = i + 1;
			return true;
		}
		const tok = state.push("math_inline", "", 0);
		tok.content = expr;
		state.pos = i + 1;
		return true;
	};
	md.inline.ruler.after("escape", "math_inline", inlineRule);

	const blockRule = (state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean => {
		const startPos = state.bMarks[startLine] + state.tShift[startLine];
		const max = state.eMarks[startLine];
		if (startPos + 2 > max) return false;
		if (state.src.charCodeAt(startPos) !== 0x24 || state.src.charCodeAt(startPos + 1) !== 0x24) return false;
		let nextLine = startLine;
		let found = false;
		let endPos = startPos;
		const remainderOnFirstLine = state.src.slice(startPos, max);
		const inlineMatch = remainderOnFirstLine.match(KATEX_BLOCK_INLINE_RE);
		if (inlineMatch) {
			if (silent) return true;
			const expr = inlineMatch[1].trim();
			const tok = state.push("math_block", "", 0);
			tok.content = expr;
			tok.block = true;
			tok.markup = "$$";
			state.line = startLine + 1;
			return true;
		}
		while (nextLine < endLine - 1) {
			nextLine++;
			const ls = state.bMarks[nextLine] + state.tShift[nextLine];
			const le = state.eMarks[nextLine];
			const text = state.src.slice(ls, le);
			if (/\$\$/.test(text)) {
				found = true;
				endPos = ls + text.indexOf("$$");
				break;
			}
		}
		if (!found) return false;
		if (silent) return true;
		const expr = state.src.slice(startPos + 2, endPos).trim();
		const tok = state.push("math_block", "", 0);
		tok.content = expr;
		tok.block = true;
		tok.markup = "$$";
		state.line = nextLine + 1;
		return true;
	};
	md.block.ruler.after("blockquote", "math_block", blockRule, { alt: ["paragraph", "reference"] });

	md.renderer.rules["math_inline"] = (tokens, idx) => {
		try {
			return katex.renderToString(tokens[idx].content, { throwOnError: false, displayMode: false });
		} catch {
			return `<code class="math-error">${esc(tokens[idx].content)}</code>`;
		}
	};
	md.renderer.rules["math_block"] = (tokens, idx) => {
		try {
			const html = katex.renderToString(tokens[idx].content, { throwOnError: false, displayMode: true });
			return `<div class="math-block">${html}</div>\n`;
		} catch {
			return `<pre class="math-error">${esc(tokens[idx].content)}</pre>\n`;
		}
	};
}

function customizeFenceRender(md: MarkdownIt): void {
	const fence = md.renderer.rules["fence"];
	md.renderer.rules["fence"] = (tokens, idx, opts, env, self) => {
		const t = tokens[idx];
		const info = (t.info ?? "").trim().toLowerCase();
		if (info === "mermaid") {
			return `<pre class="mermaid">${esc(t.content)}</pre>\n`;
		}
		return fence ? fence(tokens, idx, opts, env, self) : self.renderToken(tokens, idx, opts);
	};
}

function stripLeadingH1(tokens: Token[]): void {
	let i = 0;
	while (i < tokens.length && tokens[i].type !== "heading_open") i++;
	if (i >= tokens.length) return;
	if (tokens[i].tag !== "h1") return;
	let close = i + 1;
	while (close < tokens.length && tokens[close].type !== "heading_close") close++;
	if (close >= tokens.length) return;
	tokens.splice(i, close - i + 1);
}

function collectToc(tokens: Token[], out: TocEntry[]): void {
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.type !== "heading_open") continue;
		const tag = t.tag;
		if (tag !== "h2" && tag !== "h3") continue;
		const level = parseInt(tag.slice(1), 10);
		const idAttr = t.attrGet("id") ?? "";
		const inline = tokens[i + 1];
		const text = inline && inline.type === "inline" ? extractText(inline.children ?? []) : "";
		out.push({ level, id: idAttr, text: text.trim() });
	}
}

function extractText(tokens: Token[]): string {
	let s = "";
	for (const t of tokens) {
		if (t.type === "text") s += t.content;
		else if (t.type === "code_inline") s += t.content;
		else if (t.children) s += extractText(t.children);
	}
	return s;
}

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function truncatedExcerpt(body: string): string {
	const stripped = body
		.replace(/^---[\s\S]*?\n---\n/, "")
		.replace(/`{3}[\s\S]*?`{3}/g, "")
		.replace(/!\[\[[^\]]*\]\]/g, "")
		.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, _t, alias) => alias ?? _t)
		.trim();
	const firstPara = stripped.split(/\n{2,}/)[0] ?? "";
	const trimmed = firstPara.replace(/\s+/g, " ").trim();
	const max = 280;
	const text = trimmed.length > max ? trimmed.slice(0, max) + "…" : trimmed;
	return esc(text);
}

function encodeAttachmentPath(path: string): string {
	return path.split("/").map((seg) => encodeURIComponent(seg)).join("/");
}
