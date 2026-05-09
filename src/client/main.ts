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

function boot(): void {
	initSearch();
	activeNavObserver();
	void maybeInitGraph();
	void maybeInitMermaid();
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", boot);
} else {
	boot();
}
