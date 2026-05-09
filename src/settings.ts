export interface HtmlWikiSettings {
	port: number;
	frontmatterKey: string;
	exclusionValue: string | boolean | number;
	bindAll: boolean;
}

export const DEFAULT_SETTINGS: HtmlWikiSettings = {
	port: 8484,
	frontmatterKey: "publish",
	exclusionValue: false,
	bindAll: false,
};
