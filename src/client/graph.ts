import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
} from "d3-force";

interface RawNode {
	id: string;
	title: string;
	tags: string[];
}

interface RawEdge {
	source: string;
	target: string;
}

interface SimNode extends RawNode {
	x?: number;
	y?: number;
	vx?: number;
	vy?: number;
	fx?: number | null;
	fy?: number | null;
	degree: number;
	slug: string;
}

interface SimEdge {
	source: SimNode | string;
	target: SimNode | string;
}

interface GraphPayload {
	nodes: RawNode[];
	edges: RawEdge[];
}

function pathToSlug(p: string): string {
	return p
		.replace(/\.md$/i, "")
		.split("/")
		.map((seg) =>
			seg
				.toLowerCase()
				.replace(/['']/g, "")
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, ""),
		)
		.filter((s) => s.length > 0)
		.join("/");
}

const SVG_NS = "http://www.w3.org/2000/svg";
const COLOR_NODE = "#6B7280";
const COLOR_NODE_CURRENT = "#1C2A3A";
const COLOR_NODE_NEIGHBOUR = "#3C404A";
const COLOR_LINK = "#D4D4CE";
const COLOR_LINK_NEIGHBOUR = "#1C2A3A";
const COLOR_LABEL = "#3C404A";
const COLOR_LABEL_DIM = "#9AA0AB";

function clearChildren(el: HTMLElement): void {
	while (el.firstChild) el.removeChild(el.firstChild);
}

export async function initGraph(root: HTMLElement): Promise<void> {
	const src = root.dataset["src"] ?? "/api/graph.json";
	let payload: GraphPayload;
	try {
		const res = await fetch(src, { credentials: "same-origin" });
		if (!res.ok) throw new Error(`http ${res.status}`);
		payload = (await res.json()) as GraphPayload;
	} catch (e) {
		root.textContent = "Couldn't load the graph.";
		console.error(e);
		return;
	}
	if (!payload.nodes.length) {
		root.textContent = "No notes to show in the graph.";
		return;
	}

	const degree = new Map<string, number>();
	for (const e of payload.edges) {
		degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
		degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
	}

	const nodes: SimNode[] = payload.nodes.map((n) => ({
		...n,
		degree: degree.get(n.id) ?? 0,
		slug: pathToSlug(n.id),
	}));

	const adjacency = new Map<string, Set<string>>();
	for (const n of nodes) adjacency.set(n.id, new Set());
	for (const e of payload.edges) {
		adjacency.get(e.source)?.add(e.target);
		adjacency.get(e.target)?.add(e.source);
	}

	const edges: SimEdge[] = payload.edges
		.filter((e) => adjacency.has(e.source) && adjacency.has(e.target))
		.map((e) => ({ source: e.source, target: e.target }));

	const rect = root.getBoundingClientRect();
	const width = rect.width || 800;
	const height = rect.height || 600;

	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	svg.setAttribute("width", "100%");
	svg.setAttribute("height", "100%");
	clearChildren(root);
	root.appendChild(svg);

	const linkLayer = document.createElementNS(SVG_NS, "g");
	linkLayer.setAttribute("class", "links");
	svg.appendChild(linkLayer);
	const nodeLayer = document.createElementNS(SVG_NS, "g");
	nodeLayer.setAttribute("class", "nodes");
	svg.appendChild(nodeLayer);

	const linkEls = new Map<SimEdge, SVGLineElement>();
	for (const e of edges) {
		const line = document.createElementNS(SVG_NS, "line");
		line.setAttribute("class", "link");
		line.setAttribute("stroke", COLOR_LINK);
		line.setAttribute("stroke-width", "1");
		linkLayer.appendChild(line);
		linkEls.set(e, line);
	}

	const currentSlug = currentPageSlug();
	const nodeGroups = new Map<SimNode, { g: SVGGElement; circle: SVGCircleElement; text: SVGTextElement }>();
	for (const n of nodes) {
		const g = document.createElementNS(SVG_NS, "g");
		g.setAttribute("class", "node");
		const isCurrent = n.slug === currentSlug;
		if (isCurrent) g.classList.add("is-current");
		const r = Math.max(3, Math.min(10, 3 + Math.sqrt(n.degree) * 1.4));
		const circle = document.createElementNS(SVG_NS, "circle");
		circle.setAttribute("r", String(r));
		circle.setAttribute("fill", isCurrent ? COLOR_NODE_CURRENT : COLOR_NODE);
		circle.setAttribute("stroke", "#FFFFFF");
		circle.setAttribute("stroke-width", "1");
		g.appendChild(circle);
		const text = document.createElementNS(SVG_NS, "text");
		text.textContent = n.title;
		text.setAttribute("dx", String(r + 4));
		text.setAttribute("dy", "0.32em");
		text.setAttribute("font-family", "Inter, system-ui, sans-serif");
		text.setAttribute("font-size", "10");
		text.setAttribute("fill", isCurrent ? COLOR_NODE_CURRENT : COLOR_LABEL_DIM);
		g.appendChild(text);
		g.style.cursor = "pointer";
		g.addEventListener("click", () => {
			window.location.href = `/${n.slug}`;
		});
		g.addEventListener("mouseenter", () => highlight(n));
		g.addEventListener("mouseleave", () => clearHighlight());
		nodeLayer.appendChild(g);
		nodeGroups.set(n, { g, circle, text });
	}

	function highlight(focus: SimNode): void {
		const neighbours = adjacency.get(focus.id) ?? new Set();
		for (const [n, els] of nodeGroups.entries()) {
			const active = n === focus || neighbours.has(n.id);
			els.circle.setAttribute("fill", n === focus ? COLOR_NODE_CURRENT : active ? COLOR_NODE_NEIGHBOUR : COLOR_NODE);
			els.text.setAttribute("fill", active ? COLOR_LABEL : COLOR_LABEL_DIM);
			els.g.style.opacity = active ? "1" : "0.4";
		}
		for (const [edge, line] of linkEls.entries()) {
			const s = (edge.source as SimNode).id ?? (edge.source as string);
			const t = (edge.target as SimNode).id ?? (edge.target as string);
			const active = s === focus.id || t === focus.id;
			line.setAttribute("stroke", active ? COLOR_LINK_NEIGHBOUR : COLOR_LINK);
			line.setAttribute("stroke-opacity", active ? "1" : "0.4");
		}
	}

	function clearHighlight(): void {
		for (const [n, els] of nodeGroups.entries()) {
			const isCurrent = n.slug === currentSlug;
			els.circle.setAttribute("fill", isCurrent ? COLOR_NODE_CURRENT : COLOR_NODE);
			els.text.setAttribute("fill", isCurrent ? COLOR_NODE_CURRENT : COLOR_LABEL_DIM);
			els.g.style.opacity = "1";
		}
		for (const line of linkEls.values()) {
			line.setAttribute("stroke", COLOR_LINK);
			line.setAttribute("stroke-opacity", "0.8");
		}
	}

	const sim = forceSimulation<SimNode>(nodes)
		.force(
			"link",
			forceLink<SimNode, SimEdge>(edges)
				.id((d) => d.id)
				.distance(60)
				.strength(0.4),
		)
		.force("charge", forceManyBody<SimNode>().strength(-150))
		.force("center", forceCenter(width / 2, height / 2))
		.force("collide", forceCollide<SimNode>().radius((d) => 8 + Math.sqrt(d.degree)));

	sim.on("tick", () => {
		for (const [edge, line] of linkEls.entries()) {
			const s = edge.source as SimNode;
			const t = edge.target as SimNode;
			line.setAttribute("x1", String(s.x ?? 0));
			line.setAttribute("y1", String(s.y ?? 0));
			line.setAttribute("x2", String(t.x ?? 0));
			line.setAttribute("y2", String(t.y ?? 0));
		}
		for (const [n, els] of nodeGroups.entries()) {
			els.g.setAttribute("transform", `translate(${n.x ?? 0}, ${n.y ?? 0})`);
		}
	});
}

function currentPageSlug(): string {
	return window.location.pathname.replace(/^\/+|\/+$/g, "");
}
