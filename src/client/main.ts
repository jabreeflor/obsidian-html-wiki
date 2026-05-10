import { initSearch } from "./search";

function activeNavObserver(): void {
	const links = document.querySelectorAll<HTMLAnchorElement>("aside.toc li a");
	if (!links.length) return;
	const targets: HTMLElement[] = [];
	for (const a of Array.from(links)) {
		const href = a.getAttribute("href") ?? "";
		if (!href.startsWith("#")) continue;
		const el = document.getElementById(decodeURIComponent(href.slice(1)));
		if (el) targets.push(el);
	}
	if (!targets.length) return;
	const byId = new Map<string, HTMLAnchorElement>();
	for (const a of Array.from(links)) {
		const id = decodeURIComponent((a.getAttribute("href") ?? "").slice(1));
		byId.set(id, a);
	}
	const io = new IntersectionObserver(
		(entries) => {
			let bestId: string | null = null;
			let bestRatio = 0;
			for (const e of entries) {
				if (e.isIntersecting && e.intersectionRatio > bestRatio) {
					bestRatio = e.intersectionRatio;
					bestId = e.target.id;
				}
			}
			if (!bestId) return;
			for (const a of byId.values()) a.classList.remove("active");
			byId.get(bestId)?.classList.add("active");
		},
		{ rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
	);
	for (const t of targets) io.observe(t);
}

async function maybeInitGraph(): Promise<void> {
	const root = document.getElementById("graph-root");
	if (!root) return;
	const mod = await import("./graph");
	await mod.initGraph(root);
}

async function maybeInitMermaid(): Promise<void> {
	const blocks = document.querySelectorAll("pre.mermaid");
	if (!blocks.length) return;
	try {
		const mod = await import("mermaid");
		const mermaid = (mod as { default?: { initialize: (opts: unknown) => void; run: (opts?: unknown) => Promise<void> } }).default
			?? (mod as unknown as { initialize: (opts: unknown) => void; run: (opts?: unknown) => Promise<void> });
		mermaid.initialize({
			startOnLoad: false,
			theme: "neutral",
			fontFamily: "Inter, system-ui, sans-serif",
			themeVariables: { primaryColor: "#F7F7F5", primaryBorderColor: "#D4D4CE", lineColor: "#6B7280" },
		});
		await mermaid.run({ querySelector: "pre.mermaid" });
	} catch (e) {
		console.error("mermaid load failed", e);
	}
}

function isLazyFolder(d: HTMLDetailsElement): boolean {
	return !d.querySelector(":scope > .nav-folder-body") && !d.dataset.loaded;
}

async function loadFolderBody(d: HTMLDetailsElement): Promise<void> {
	if (d.dataset.loaded) return;
	const folder = d.dataset.folder;
	if (folder === undefined) return;
	d.dataset.loaded = "1";
	try {
		const url = `/api/nav/folder/${folder
			.split("/")
			.map(encodeURIComponent)
			.join("/")}`;
		const res = await fetch(url);
		if (!res.ok) {
			delete d.dataset.loaded;
			return;
		}
		const html = await res.text();
		d.insertAdjacentHTML("beforeend", html);
		const newFolders = d.querySelectorAll<HTMLDetailsElement>(
			":scope > .nav-folder-body details.nav-folder",
		);
		for (const sub of Array.from(newFolders)) wireLazyToggle(sub);
	} catch {
		delete d.dataset.loaded;
	}
}

function wireLazyToggle(d: HTMLDetailsElement): void {
	if (d.dataset.lazyWired === "1") return;
	d.dataset.lazyWired = "1";
	d.addEventListener("toggle", () => {
		if (d.open && isLazyFolder(d)) void loadFolderBody(d);
	});
}

function lazyNavFolders(nav: Element): void {
	const folders = nav.querySelectorAll<HTMLDetailsElement>("details.nav-folder");
	for (const d of Array.from(folders)) wireLazyToggle(d);
}

function navFilter(): void {
	const input = document.getElementById("nav-filter") as HTMLInputElement | null;
	if (!input) return;
	const nav = input.closest("aside.nav");
	if (!nav) return;
	const originalOpen = new WeakMap<HTMLDetailsElement, boolean>();
	const snapshot = (): void => {
		const folders = nav.querySelectorAll<HTMLDetailsElement>("details.nav-folder");
		for (const f of Array.from(folders)) {
			if (!originalOpen.has(f)) originalOpen.set(f, f.open);
		}
	};
	snapshot();

	const applyClear = (): void => {
		const items = nav.querySelectorAll<HTMLLIElement>("li");
		for (const li of Array.from(items)) li.classList.remove("hidden");
		const folders = nav.querySelectorAll<HTMLDetailsElement>("details.nav-folder");
		for (const f of Array.from(folders)) {
			f.classList.remove("hidden");
			if (originalOpen.has(f)) f.open = originalOpen.get(f)!;
		}
	};

	const applyFilter = async (q: string): Promise<void> => {
		snapshot();
		const lazy = Array.from(
			nav.querySelectorAll<HTMLDetailsElement>("details.nav-folder"),
		).filter(isLazyFolder);
		if (lazy.length) await Promise.all(lazy.map(loadFolderBody));
		const folders = nav.querySelectorAll<HTMLDetailsElement>("details.nav-folder");
		for (const f of Array.from(folders)) f.open = true;
		const items = nav.querySelectorAll<HTMLLIElement>("li");
		for (const li of Array.from(items)) {
			const a = li.querySelector("a");
			const text = (a?.textContent ?? "").toLowerCase();
			li.classList.toggle("hidden", !text.includes(q));
		}
		for (const f of Array.from(folders)) {
			const visibleLi = f.querySelector<HTMLLIElement>("li:not(.hidden)");
			f.classList.toggle("hidden", !visibleLi);
		}
	};

	let token = 0;
	input.addEventListener("input", () => {
		const q = input.value.trim().toLowerCase();
		const my = ++token;
		if (!q) {
			applyClear();
			return;
		}
		void applyFilter(q).then(() => {
			if (my !== token) return;
		});
	});
}

function boot(): void {
	initSearch();
	activeNavObserver();
	const nav = document.querySelector("aside.nav");
	if (nav) lazyNavFolders(nav);
	navFilter();
	void maybeInitGraph();
	void maybeInitMermaid();
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", boot);
} else {
	boot();
}
