import MiniSearch, { type Options as MiniSearchOptions } from "minisearch";

interface SearchDoc {
	id: string;
	slug: string;
	title: string;
	tags: string[];
	excerpt: string;
}

interface SearchPayload {
	docs: SearchDoc[];
	fields?: string[];
	storeFields?: string[];
}

let miniPromise: Promise<MiniSearch<SearchDoc>> | null = null;

async function loadIndex(): Promise<MiniSearch<SearchDoc>> {
	if (miniPromise) return miniPromise;
	miniPromise = (async () => {
		const res = await fetch("/api/search-index.json", { credentials: "same-origin" });
		if (!res.ok) throw new Error(`search index http ${res.status}`);
		const payload = (await res.json()) as SearchPayload;
		const opts: MiniSearchOptions<SearchDoc> = {
			fields: payload.fields ?? ["title", "tags", "excerpt"],
			storeFields: payload.storeFields ?? ["slug", "title", "tags", "excerpt"],
			searchOptions: {
				boost: { title: 3, tags: 2, excerpt: 1 },
				prefix: true,
				fuzzy: 0.15,
			},
		};
		const ms = new MiniSearch<SearchDoc>(opts);
		ms.addAll(payload.docs);
		return ms;
	})();
	try {
		return await miniPromise;
	} catch (e) {
		miniPromise = null;
		throw e;
	}
}

interface PopoverEls {
	overlay: HTMLDivElement;
	input: HTMLInputElement;
	hits: HTMLDivElement;
}

let popover: PopoverEls | null = null;

function clearChildren(el: HTMLElement): void {
	while (el.firstChild) el.removeChild(el.firstChild);
}

function ensurePopover(): PopoverEls {
	if (popover) return popover;
	const overlay = document.createElement("div");
	overlay.className = "search-popover";
	overlay.hidden = true;
	overlay.setAttribute("role", "dialog");
	overlay.setAttribute("aria-modal", "true");
	overlay.setAttribute("aria-label", "Search the wiki");

	const panel = document.createElement("div");
	panel.className = "panel";

	const input = document.createElement("input");
	input.type = "search";
	input.placeholder = "Search the wiki";
	input.autocomplete = "off";
	input.spellcheck = false;
	panel.appendChild(input);

	const hits = document.createElement("div");
	hits.className = "hits";
	panel.appendChild(hits);

	overlay.appendChild(panel);
	overlay.addEventListener("click", (e) => {
		if (e.target === overlay) closePopover();
	});

	document.addEventListener("keydown", (e) => {
		if (overlay.hidden) return;
		if (e.key === "Escape") {
			e.preventDefault();
			closePopover();
		}
	});

	let composing = false;
	input.addEventListener("compositionstart", () => {
		composing = true;
	});
	input.addEventListener("compositionend", () => {
		composing = false;
		void renderResults(input.value, hits);
	});
	input.addEventListener("input", () => {
		if (composing) return;
		void renderResults(input.value, hits);
	});

	document.body.appendChild(overlay);
	popover = { overlay, input, hits };
	return popover;
}

function openPopover(prefill?: string): void {
	const els = ensurePopover();
	els.overlay.hidden = false;
	if (prefill !== undefined) els.input.value = prefill;
	els.input.focus();
	els.input.select();
	void renderResults(els.input.value, els.hits);
}

function closePopover(): void {
	if (!popover) return;
	popover.overlay.hidden = true;
}

const renderTokens = new WeakMap<HTMLElement, number>();

async function renderResults(query: string, target: HTMLElement): Promise<void> {
	const token = (renderTokens.get(target) ?? 0) + 1;
	renderTokens.set(target, token);
	const isStale = (): boolean => renderTokens.get(target) !== token;

	if (!query.trim()) {
		clearChildren(target);
		target.appendChild(emptyState("Type to search."));
		return;
	}
	let ms: MiniSearch<SearchDoc>;
	try {
		ms = await loadIndex();
	} catch (e) {
		if (isStale()) return;
		clearChildren(target);
		target.appendChild(emptyState("Couldn't load the search index."));
		console.error(e);
		return;
	}
	if (isStale()) return;
	const results = ms.search(query, { boost: { title: 3, tags: 2, excerpt: 1 }, prefix: true, fuzzy: 0.15 }).slice(0, 20);
	clearChildren(target);
	if (!results.length) {
		target.appendChild(emptyState("No matches."));
		return;
	}
	const frag = document.createDocumentFragment();
	for (const r of results) {
		const a = document.createElement("a");
		a.className = "hit";
		a.href = `/${r["slug"]}`;
		a.dataset["slug"] = String(r["slug"] ?? "");
		const title = document.createElement("div");
		title.className = "hit-title";
		title.textContent = String(r["title"] ?? "");
		a.appendChild(title);
		const excerpt = String(r["excerpt"] ?? "");
		if (excerpt) {
			const ex = document.createElement("div");
			ex.className = "hit-excerpt";
			ex.textContent = excerpt;
			a.appendChild(ex);
		}
		const tags = r["tags"] as string[] | undefined;
		if (Array.isArray(tags) && tags.length) {
			const row = document.createElement("div");
			row.className = "hit-tags";
			for (const t of tags) {
				const pill = document.createElement("span");
				pill.className = "pill";
				pill.textContent = `#${t}`;
				row.appendChild(pill);
			}
			a.appendChild(row);
		}
		frag.appendChild(a);
	}
	target.appendChild(frag);
}

function emptyState(text: string): HTMLDivElement {
	const div = document.createElement("div");
	div.className = "hit empty";
	div.textContent = text;
	return div;
}

function bindHotkey(): void {
	document.addEventListener("keydown", (e) => {
		if (!(e.metaKey || e.ctrlKey)) return;
		if (e.key !== "k" && e.key !== "K") return;
		e.preventDefault();
		const seed = (document.getElementById("site-search") as HTMLInputElement | null)?.value ?? "";
		openPopover(seed);
	});

	const form = document.querySelector("form.search") as HTMLFormElement | null;
	const input = document.getElementById("site-search") as HTMLInputElement | null;
	if (input) {
		input.addEventListener("focus", (e) => {
			e.preventDefault();
			input.blur();
			openPopover("");
		});
	}
	if (form) {
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const seed = input?.value ?? "";
			openPopover(seed);
		});
	}
}

function bindSearchPage(): void {
	const input = document.getElementById("search-input") as HTMLInputElement | null;
	const results = document.getElementById("search-results") as HTMLDivElement | null;
	if (!input || !results) return;
	let composing = false;
	input.addEventListener("compositionstart", () => {
		composing = true;
	});
	input.addEventListener("compositionend", () => {
		composing = false;
		void renderResults(input.value, results);
	});
	input.addEventListener("input", () => {
		if (composing) return;
		void renderResults(input.value, results);
	});
	if (input.value) {
		void renderResults(input.value, results);
	} else {
		results.appendChild(emptyState("Type to search."));
	}
}

export function initSearch(): void {
	bindHotkey();
	bindSearchPage();
}
