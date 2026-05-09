import http from "node:http";
import { VaultIndex } from "./vault-index";
import { Renderer } from "./renderer";
import { CLIENT_JS, KATEX_CSS, THEME_CSS } from "./theme/bundled";
import {
	homePage,
	notePage,
	tagsIndexPage,
	tagPage,
	graphPage,
	searchPage,
	notFoundPage,
	SiteContext,
} from "./theme/templates";
import { buildSearchPayload } from "./search-index";

export interface AttachmentSource {
	read(relativePath: string): Promise<Uint8Array | null>;
}

export interface AssetBundle {
	"theme.css": string;
	"client.js": string;
	"katex.css": string;
}

export interface ServerDeps {
	vaultName: string;
	index: VaultIndex;
	attachments: AttachmentSource;
	assets: AssetBundle;
}

export interface StartOptions {
	port: number;
	host: string;
	maxRetries?: number;
}

export interface StartResult {
	port: number;
	host: string;
}

const TEXT_HTML = "text/html; charset=utf-8";
const APP_JSON = "application/json; charset=utf-8";
const TEXT_CSS = "text/css; charset=utf-8";
const TEXT_JS = "application/javascript; charset=utf-8";

const ATTACHMENT_MIMES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	svg: "image/svg+xml",
	webp: "image/webp",
	avif: "image/avif",
	bmp: "image/bmp",
	ico: "image/x-icon",
	pdf: "application/pdf",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	ogg: "audio/ogg",
	m4a: "audio/mp4",
	mp4: "video/mp4",
	webm: "video/webm",
	mov: "video/quicktime",
};

export class HtmlWikiServer {
	private server: http.Server | null = null;
	private renderer: Renderer;
	private deps: ServerDeps;
	private boundPort: number = 0;
	private boundHost: string = "127.0.0.1";

	constructor(deps: ServerDeps) {
		this.deps = deps;
		this.renderer = new Renderer();
	}

	updateDeps(partial: Partial<ServerDeps>): void {
		this.deps = { ...this.deps, ...partial };
	}

	async start(opts: StartOptions): Promise<StartResult> {
		const maxRetries = opts.maxRetries ?? 5;
		let lastError: Error | null = null;
		const candidates: number[] = [];
		if (opts.port === 0) {
			candidates.push(0);
		} else {
			for (let i = 0; i <= maxRetries; i++) {
				candidates.push(opts.port + i);
			}
		}
		for (const candidate of candidates) {
			try {
				const result = await this.bind(candidate, opts.host);
				this.boundPort = result.port;
				this.boundHost = result.host;
				return result;
			} catch (e) {
				lastError = e as Error;
				if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
			}
		}
		throw lastError ?? new Error("Could not bind a port");
	}

	private bind(port: number, host: string): Promise<StartResult> {
		return new Promise((resolve, reject) => {
			const srv = http.createServer((req, res) => {
				void this.handle(req, res);
			});
			const onError = (err: Error): void => {
				srv.removeListener("listening", onListening);
				reject(err);
			};
			const onListening = (): void => {
				srv.removeListener("error", onError);
				const addr = srv.address();
				const actualPort = typeof addr === "object" && addr ? addr.port : port;
				this.server = srv;
				resolve({ port: actualPort, host });
			};
			srv.once("error", onError);
			srv.once("listening", onListening);
			srv.listen(port, host);
		});
	}

	async stop(): Promise<void> {
		const srv = this.server;
		if (!srv) return;
		this.server = null;
		await new Promise<void>((resolve, reject) => {
			srv.close((err) => (err ? reject(err) : resolve()));
		});
	}

	async restart(opts: StartOptions): Promise<StartResult> {
		await this.stop();
		return this.start(opts);
	}

	getAddress(): StartResult {
		return { port: this.boundPort, host: this.boundHost };
	}

	private siteContext(): SiteContext {
		return { vaultName: this.deps.vaultName, index: this.deps.index };
	}

	private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			if (req.method !== "GET" && req.method !== "HEAD") {
				this.write(res, 405, TEXT_HTML, "Method Not Allowed");
				return;
			}
			const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
			const pathname = decodeURIComponent(url.pathname);
			await this.route(pathname, res);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Internal error";
			this.write(res, 500, TEXT_HTML, `<h1>500</h1><pre>${escapeHtml(msg)}</pre>`);
		}
	}

	private async route(pathname: string, res: http.ServerResponse): Promise<void> {
		const site = this.siteContext();
		if (pathname === "/" || pathname === "") {
			this.write(res, 200, TEXT_HTML, homePage(site));
			return;
		}
		if (pathname === "/tags" || pathname === "/tags/") {
			this.write(res, 200, TEXT_HTML, tagsIndexPage(site));
			return;
		}
		if (pathname.startsWith("/tags/")) {
			const tag = pathname.slice("/tags/".length).replace(/\/$/, "");
			if (!tag) {
				this.write(res, 200, TEXT_HTML, tagsIndexPage(site));
				return;
			}
			this.write(res, 200, TEXT_HTML, tagPage(site, tag));
			return;
		}
		if (pathname === "/graph" || pathname === "/graph/") {
			this.write(res, 200, TEXT_HTML, graphPage(site));
			return;
		}
		if (pathname === "/search" || pathname === "/search/") {
			this.write(res, 200, TEXT_HTML, searchPage(site));
			return;
		}
		if (pathname === "/api/search-index.json") {
			this.write(res, 200, APP_JSON, JSON.stringify(buildSearchPayload(site.index)));
			return;
		}
		if (pathname === "/api/graph.json") {
			this.write(res, 200, APP_JSON, JSON.stringify(site.index.graphData()));
			return;
		}
		if (pathname.startsWith("/assets/")) {
			await this.serveAsset(pathname.slice("/assets/".length), res);
			return;
		}
		if (pathname.startsWith("/attachments/")) {
			await this.serveAttachment(pathname.slice("/attachments/".length), res);
			return;
		}
		const slug = pathname.replace(/^\/+|\/+$/g, "");
		const note = site.index.bySlug(slug);
		if (!note) {
			this.write(res, 404, TEXT_HTML, notFoundPage(site, pathname));
			return;
		}
		this.write(res, 200, TEXT_HTML, notePage(note, site, this.renderer));
	}

	private async serveAsset(name: string, res: http.ServerResponse): Promise<void> {
		const safe = name.replace(/\.\.+/g, "");
		const map = this.deps.assets;
		if (safe === "theme.css") {
			this.write(res, 200, TEXT_CSS, map["theme.css"]);
			return;
		}
		if (safe === "client.js") {
			this.write(res, 200, TEXT_JS, map["client.js"]);
			return;
		}
		if (safe === "katex.css") {
			this.write(res, 200, TEXT_CSS, map["katex.css"]);
			return;
		}
		this.write(res, 404, TEXT_HTML, "asset not found");
	}

	private async serveAttachment(name: string, res: http.ServerResponse): Promise<void> {
		const safe = name.replace(/\.\.+/g, "").replace(/^\/+/, "");
		if (!safe) {
			this.write(res, 404, TEXT_HTML, "attachment not found");
			return;
		}
		const data = await this.deps.attachments.read(safe);
		if (!data) {
			this.write(res, 404, TEXT_HTML, "attachment not found");
			return;
		}
		const ext = safe.slice(safe.lastIndexOf(".") + 1).toLowerCase();
		const mime = ATTACHMENT_MIMES[ext] ?? "application/octet-stream";
		res.statusCode = 200;
		res.setHeader("content-type", mime);
		res.setHeader("content-length", data.byteLength);
		res.end(Buffer.from(data));
	}

	private write(
		res: http.ServerResponse,
		status: number,
		contentType: string,
		body: string,
	): void {
		const buf = Buffer.from(body, "utf-8");
		res.statusCode = status;
		res.setHeader("content-type", contentType);
		res.setHeader("content-length", buf.byteLength);
		res.end(buf);
	}
}

export function loadDefaultAssets(): AssetBundle {
	return {
		"theme.css": THEME_CSS,
		"client.js": CLIENT_JS,
		"katex.css": KATEX_CSS,
	};
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>]/g, (c) =>
		c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;",
	);
}
