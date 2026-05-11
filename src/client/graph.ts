import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	type Simulation,
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

interface Transform {
	x: number;
	y: number;
	k: number;
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

const ZOOM_MIN = 0.15;
const ZOOM_MAX = 6;
const ZOOM_WHEEL_STEP = 0.0015;
const ZOOM_BUTTON_STEP = 1.2;
const LABEL_HIDE_BELOW = 0.6;
const DRAG_THRESHOLD_PX = 4;

function clearChildren(el: HTMLElement): void {
	while (el.firstChild) el.removeChild(el.firstChild);
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

function makeCtrlButton(action: string, label: string, glyph: string): HTMLButtonElement {
	const b = document.createElement("button");
	b.type = "button";
	b.className = "graph-ctrl";
	b.dataset["action"] = action;
	b.setAttribute("aria-label", label);
	b.title = label;
	b.textContent = glyph;
	return b;
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

	clearChildren(root);

	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	svg.setAttribute("width", "100%");
	svg.setAttribute("height", "100%");
	svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
	svg.style.touchAction = "none";
	svg.style.cursor = "grab";
	root.appendChild(svg);

	const zoomLayer = document.createElementNS(SVG_NS, "g");
	zoomLayer.setAttribute("class", "zoom");
	svg.appendChild(zoomLayer);

	const linkLayer = document.createElementNS(SVG_NS, "g");
	linkLayer.setAttribute("class", "links");
	zoomLayer.appendChild(linkLayer);
	const nodeLayer = document.createElementNS(SVG_NS, "g");
	nodeLayer.setAttribute("class", "nodes");
	zoomLayer.appendChild(nodeLayer);

	const transform: Transform = { x: 0, y: 0, k: 1 };
	function applyTransform(): void {
		zoomLayer.setAttribute(
			"transform",
			`translate(${transform.x}, ${transform.y}) scale(${transform.k})`,
		);
		const showLabels = transform.k >= LABEL_HIDE_BELOW;
		nodeLayer.setAttribute("data-show-labels", showLabels ? "1" : "0");
		for (const els of nodeGroups.values()) {
			els.text.style.display = showLabels ? "" : "none";
		}
	}

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
	const nodeGroups = new Map<
		SimNode,
		{ g: SVGGElement; circle: SVGCircleElement; text: SVGTextElement }
	>();
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
		g.addEventListener("mouseenter", () => highlight(n));
		g.addEventListener("mouseleave", () => clearHighlight());
		nodeLayer.appendChild(g);
		nodeGroups.set(n, { g, circle, text });
	}

	function highlight(focus: SimNode): void {
		const neighbours = adjacency.get(focus.id) ?? new Set();
		for (const [n, els] of nodeGroups.entries()) {
			const active = n === focus || neighbours.has(n.id);
			els.circle.setAttribute(
				"fill",
				n === focus ? COLOR_NODE_CURRENT : active ? COLOR_NODE_NEIGHBOUR : COLOR_NODE,
			);
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

	const sim: Simulation<SimNode, SimEdge> = forceSimulation<SimNode>(nodes)
		.force(
			"link",
			forceLink<SimNode, SimEdge>(edges)
				.id((d) => d.id)
				.distance(60)
				.strength(0.4),
		)
		.force("charge", forceManyBody<SimNode>().strength(-150))
		.force("center", forceCenter(width / 2, height / 2))
		.force(
			"collide",
			forceCollide<SimNode>().radius((d) => 8 + Math.sqrt(d.degree)),
		);

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

	// ── Pan / zoom / drag ──────────────────────────────────────────────

	function svgPointFromEvent(clientX: number, clientY: number): { x: number; y: number } {
		const r = svg.getBoundingClientRect();
		const vx = ((clientX - r.left) / r.width) * width;
		const vy = ((clientY - r.top) / r.height) * height;
		return { x: vx, y: vy };
	}

	function worldFromSvgPoint(p: { x: number; y: number }): { x: number; y: number } {
		return { x: (p.x - transform.x) / transform.k, y: (p.y - transform.y) / transform.k };
	}

	function zoomAt(svgX: number, svgY: number, factor: number): void {
		const newK = clamp(transform.k * factor, ZOOM_MIN, ZOOM_MAX);
		const actual = newK / transform.k;
		transform.x = svgX - (svgX - transform.x) * actual;
		transform.y = svgY - (svgY - transform.y) * actual;
		transform.k = newK;
		applyTransform();
	}

	svg.addEventListener(
		"wheel",
		(e: WheelEvent) => {
			e.preventDefault();
			const p = svgPointFromEvent(e.clientX, e.clientY);
			const factor = Math.exp(-e.deltaY * ZOOM_WHEEL_STEP);
			zoomAt(p.x, p.y, factor);
		},
		{ passive: false },
	);

	type PanState = { mode: "pan"; startX: number; startY: number; origX: number; origY: number };
	type NodeDragState = {
		mode: "node";
		node: SimNode;
		startX: number;
		startY: number;
		moved: boolean;
	};
	type PinchState = {
		mode: "pinch";
		startDist: number;
		startK: number;
		centerWorld: { x: number; y: number };
	};
	let gesture: PanState | NodeDragState | PinchState | null = null;
	const activePointers = new Map<number, { x: number; y: number }>();

	function pickNode(target: EventTarget | null): SimNode | null {
		let el = target as Element | null;
		while (el && el !== svg) {
			if (el instanceof SVGGElement && el.classList.contains("node")) {
				for (const [n, els] of nodeGroups.entries()) {
					if (els.g === el) return n;
				}
			}
			el = el.parentElement;
		}
		return null;
	}

	svg.addEventListener("pointerdown", (e: PointerEvent) => {
		if (e.button !== 0 && e.pointerType === "mouse") return;
		svg.setPointerCapture(e.pointerId);
		activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (activePointers.size === 2) {
			const pts = Array.from(activePointers.values());
			const dx = pts[0].x - pts[1].x;
			const dy = pts[0].y - pts[1].y;
			const centerClient = {
				x: (pts[0].x + pts[1].x) / 2,
				y: (pts[0].y + pts[1].y) / 2,
			};
			const centerSvg = svgPointFromEvent(centerClient.x, centerClient.y);
			gesture = {
				mode: "pinch",
				startDist: Math.hypot(dx, dy) || 1,
				startK: transform.k,
				centerWorld: worldFromSvgPoint(centerSvg),
			};
			return;
		}

		const n = pickNode(e.target);
		if (n) {
			gesture = {
				mode: "node",
				node: n,
				startX: e.clientX,
				startY: e.clientY,
				moved: false,
			};
			sim.alphaTarget(0.3).restart();
			n.fx = n.x ?? 0;
			n.fy = n.y ?? 0;
		} else {
			gesture = {
				mode: "pan",
				startX: e.clientX,
				startY: e.clientY,
				origX: transform.x,
				origY: transform.y,
			};
			svg.style.cursor = "grabbing";
		}
	});

	svg.addEventListener("pointermove", (e: PointerEvent) => {
		if (!activePointers.has(e.pointerId)) return;
		activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (!gesture) return;

		if (gesture.mode === "pinch") {
			if (activePointers.size < 2) return;
			const pts = Array.from(activePointers.values());
			const dx = pts[0].x - pts[1].x;
			const dy = pts[0].y - pts[1].y;
			const dist = Math.hypot(dx, dy) || 1;
			const newK = clamp(
				gesture.startK * (dist / gesture.startDist),
				ZOOM_MIN,
				ZOOM_MAX,
			);
			const centerClient = {
				x: (pts[0].x + pts[1].x) / 2,
				y: (pts[0].y + pts[1].y) / 2,
			};
			const centerSvg = svgPointFromEvent(centerClient.x, centerClient.y);
			transform.k = newK;
			transform.x = centerSvg.x - gesture.centerWorld.x * newK;
			transform.y = centerSvg.y - gesture.centerWorld.y * newK;
			applyTransform();
			return;
		}

		if (gesture.mode === "pan") {
			const r = svg.getBoundingClientRect();
			const sx = width / r.width;
			const sy = height / r.height;
			transform.x = gesture.origX + (e.clientX - gesture.startX) * sx;
			transform.y = gesture.origY + (e.clientY - gesture.startY) * sy;
			applyTransform();
			return;
		}

		if (gesture.mode === "node") {
			const dx = e.clientX - gesture.startX;
			const dy = e.clientY - gesture.startY;
			if (!gesture.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
				gesture.moved = true;
			}
			const p = worldFromSvgPoint(svgPointFromEvent(e.clientX, e.clientY));
			gesture.node.fx = p.x;
			gesture.node.fy = p.y;
		}
	});

	function endPointer(e: PointerEvent): void {
		if (!activePointers.has(e.pointerId)) return;
		activePointers.delete(e.pointerId);
		if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);

		if (!gesture) return;

		if (gesture.mode === "pinch") {
			if (activePointers.size < 2) {
				const remaining = Array.from(activePointers.entries())[0];
				if (remaining) {
					gesture = {
						mode: "pan",
						startX: remaining[1].x,
						startY: remaining[1].y,
						origX: transform.x,
						origY: transform.y,
					};
				} else {
					gesture = null;
				}
			}
			return;
		}

		if (gesture.mode === "pan") {
			svg.style.cursor = "grab";
			gesture = null;
			return;
		}

		if (gesture.mode === "node") {
			const node = gesture.node;
			const moved = gesture.moved;
			sim.alphaTarget(0);
			if (moved) {
				// Stay where dropped — pin the node at its release point.
				node.fx = node.x ?? 0;
				node.fy = node.y ?? 0;
			} else {
				node.fx = null;
				node.fy = null;
				window.location.href = `/${node.slug}`;
			}
			gesture = null;
		}
	}
	svg.addEventListener("pointerup", endPointer);
	svg.addEventListener("pointercancel", endPointer);
	svg.addEventListener("pointerleave", (e) => {
		if (gesture?.mode === "pan") {
			svg.style.cursor = "grab";
		}
		endPointer(e);
	});

	// ── On-screen controls ─────────────────────────────────────────────

	const controls = document.createElement("div");
	controls.className = "graph-controls";
	controls.appendChild(makeCtrlButton("zoom-in", "Zoom in", "+"));
	controls.appendChild(makeCtrlButton("zoom-out", "Zoom out", "−"));
	controls.appendChild(makeCtrlButton("reset", "Reset view", "↻"));
	controls.appendChild(makeCtrlButton("unpin", "Release pinned nodes", "✕"));
	root.appendChild(controls);

	function zoomAtCenter(factor: number): void {
		zoomAt(width / 2, height / 2, factor);
	}

	function resetView(): void {
		transform.x = 0;
		transform.y = 0;
		transform.k = 1;
		applyTransform();
		sim.alpha(0.6).restart();
	}

	function unpinAll(): void {
		for (const n of nodes) {
			n.fx = null;
			n.fy = null;
		}
		sim.alpha(0.6).restart();
	}

	controls.addEventListener("click", (e) => {
		const t = e.target as HTMLElement | null;
		const action = t?.dataset["action"];
		if (action === "zoom-in") zoomAtCenter(ZOOM_BUTTON_STEP);
		else if (action === "zoom-out") zoomAtCenter(1 / ZOOM_BUTTON_STEP);
		else if (action === "reset") resetView();
		else if (action === "unpin") unpinAll();
	});

	svg.tabIndex = 0;
	svg.addEventListener("keydown", (e) => {
		if (e.key === "+" || e.key === "=") {
			zoomAtCenter(ZOOM_BUTTON_STEP);
			e.preventDefault();
		} else if (e.key === "-" || e.key === "_") {
			zoomAtCenter(1 / ZOOM_BUTTON_STEP);
			e.preventDefault();
		} else if (e.key === "0") {
			resetView();
			e.preventDefault();
		}
	});

	applyTransform();
}

function currentPageSlug(): string {
	return window.location.pathname.replace(/^\/+|\/+$/g, "");
}
