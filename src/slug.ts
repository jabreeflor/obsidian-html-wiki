export function slugify(pathOrText: string, stripExt: boolean = false): string {
	let s = pathOrText;
	if (stripExt) s = s.replace(/\.md$/i, "");
	const segments = s.split("/").map((seg) =>
		seg
			.toLowerCase()
			.replace(/['']/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
	);
	return segments.filter((s) => s.length > 0).join("/");
}

export function pathToSlug(vaultPath: string): string {
	return slugify(vaultPath, true);
}
