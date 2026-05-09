import { VaultIndex } from "./vault-index";

export interface SearchDoc {
	id: string;
	slug: string;
	title: string;
	tags: string[];
	excerpt: string;
}

export interface SearchPayload {
	docs: SearchDoc[];
	fields: string[];
	storeFields: string[];
}

export function buildSearchPayload(index: VaultIndex): SearchPayload {
	const docs: SearchDoc[] = index.visible().map((note) => ({
		id: note.path,
		slug: note.slug,
		title: note.title,
		tags: note.tags,
		excerpt: excerptOf(note.body),
	}));
	return {
		docs,
		fields: ["title", "tags", "excerpt"],
		storeFields: ["slug", "title", "tags", "excerpt"],
	};
}

function excerptOf(body: string): string {
	const stripped = body
		.replace(/^---[\s\S]*?\n---\n/, "")
		.replace(/`{3}[\s\S]*?`{3}/g, "")
		.replace(/!\[\[[^\]]*\]\]/g, "")
		.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, alias) => alias ?? t)
		.replace(/\s+/g, " ")
		.trim();
	return stripped.length > 320 ? stripped.slice(0, 320) + "…" : stripped;
}
