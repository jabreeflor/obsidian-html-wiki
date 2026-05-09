# Obsidian HTML Wiki — Design Spec

**Date:** 2026-05-09
**Status:** Approved by user, ready for implementation
**Plugin id:** `obsidian-html-wiki`
**Plugin name:** HTML Wiki

---

## 1. Premise

Turn any Obsidian vault into a browsable HTML wiki, in real time, with no export step.
The user enables the plugin → the vault becomes viewable as HTML at `http://127.0.0.1:8484/`.
Files added or edited in Obsidian appear or update in the wiki immediately, with no rebuild,
no "publish" command, no folder to manage.

This is **not** Obsidian Publish. There is no remote server, no account, no syncing. The wiki
runs locally and is only reachable from the user's own machine unless they explicitly forward
the port.

## 2. Non-goals

- No remote hosting, accounts, or sync.
- No mobile support in v1 (sets `isDesktopOnly: true`).
- No write-back: the wiki is read-only; editing happens in Obsidian.
- No multi-vault support per-instance (one plugin instance = the current vault).
- No theme switcher: ships with one opinionated theme (Quiet Reference).
- No Dataview, Templater, or other plugin pass-through. Pure markdown features only.

## 3. User experience

### 3.1 Enabling the plugin

1. User installs and enables the community plugin.
2. Plugin starts an HTTP server on `127.0.0.1:8484` (configurable).
3. Plugin builds an in-memory index of the vault (all `.md` files except those excluded
   via frontmatter `publish: false`).
4. A status-bar item shows the live URL: `wiki: 127.0.0.1:8484 ●`.
5. A ribbon icon (book) lets the user open the vault in their default browser.

### 3.2 During normal use

- The user works in Obsidian as usual.
- When a note is created/modified/deleted/renamed, the index updates incrementally.
- The browser shows the latest version on next page load. (No SSE/live-reload in v1 — that's a v1.1 nicety.)
- Two commands are registered:
  - `HTML Wiki: Open this note in browser` (works on the active editor file)
  - `HTML Wiki: Open vault home in browser`

### 3.3 Settings tab

Settings (all live-applied):
- **Port** (default `8484`).
- **Frontmatter key for exclusion** (default `publish`; notes with that key set to `false` are hidden).
- **Bind to all interfaces** (default off; on means server listens on `0.0.0.0` instead of `127.0.0.1` — for LAN sharing, with a clear warning).
- **Restart server** button.
- **Open vault** button.

### 3.4 Privacy & sensitive notes

Default behavior: **all notes are exported.** Notes with `publish: false` (or the configured
key set to `false`) in frontmatter are excluded from:
- The site index
- Search results
- The graph
- Backlinks panels (a hidden note that links to a visible note does not appear as a backlink)
- Direct URL access (returns 404)

The list of excluded paths is computed from the index and refreshed on every vault event.

## 4. Visual design (theme)

The theme is **Quiet Reference** — see `mockups/02-quiet-reference.html` for the canonical reference. Key properties:

- **Typography**:
  - Body & display: **Newsreader** (variable serif, opsz 6–72, weights 400–700) — Google Fonts.
  - UI chrome: **Inter** (variable sans, weights 400–600) — Google Fonts.
  - Code: **JetBrains Mono** — Google Fonts.
  - Fonts loaded with `font-display: swap`. Fallback stack: `Georgia, serif` / `system-ui, sans-serif`.
- **Color tokens**:
  ```
  --bg:           #FFFFFF
  --bg-soft:      #F7F7F5
  --ink:          #0F1115
  --ink-2:        #3C404A
  --ink-3:        #6B7280
  --ink-4:        #9AA0AB
  --rule:         #E8E8E4
  --rule-strong:  #D4D4CE
  --accent:       #1C2A3A   /* deep ink-blue, NOT tech blue */
  --highlight:    #F5EFD8
  ```
- **Layout**: 3 columns at ≥1100px (16rem nav | content | 16rem TOC+backlinks). Collapses to 2 (drops TOC) at <1100px and 1 (drops nav) at <780px. Reading column max-width 46rem.
- **Components** (all per the mockup): top bar with brand+search+nav, left file-tree nav with grouped sections, breadcrumbs, h1+lede+meta-row+tag pills, body in serif at 1.06rem/1.7, callouts as bordered cards with circular icon + label, code blocks with rule + soft bg, right rail with sticky on-this-page TOC + numbered backlinks + small graph thumbnail.
- **Anti-tells** (things that would make this look AI-generic, intentionally avoided): purple/violet anywhere, gradient buttons, shadcn-style stacked cards, emoji-as-icons, generic "tech blue" `#3B82F6`, full-width hero images with gradient overlays, centered marketing-page typography.

## 5. Architecture

```
Obsidian (main process)
└── HtmlWikiPlugin
    ├── VaultIndex          // in-memory, source of truth
    │   ├── files: Map<path, IndexedNote>
    │   ├── tags: Map<tag, Set<path>>
    │   ├── backlinks: Map<path, Set<path>>
    │   └── graph: { nodes, edges }
    ├── Renderer            // path → HTML
    │   ├── markdown-it pipeline
    │   ├── wikilink resolver
    │   ├── embed handler
    │   ├── callout block parser
    │   ├── KaTeX (server-side)
    │   └── Mermaid (client-side, lazy)
    ├── HttpServer          // node:http, listens on 127.0.0.1:port
    │   └── routes
    ├── ThemeBundle         // CSS + tiny client JS, served from /assets/
    ├── SettingsTab
    └── EventWiring         // vault events → index updates
```

### 5.1 VaultIndex

`IndexedNote` shape:
```ts
type IndexedNote = {
  path: string            // vault-relative, e.g. "On Reading/Boredom.md"
  slug: string            // url path, e.g. "on-reading/boredom"
  title: string           // h1 or filename
  frontmatter: Record<string, unknown>
  excluded: boolean       // computed from frontmatter
  outlinks: string[]      // resolved paths of [[wikilinks]]
  embeddedAttachments: string[]
  tags: string[]
  mtime: number
  contentHash: string     // for cache invalidation
}
```

Built on plugin load by walking `app.vault.getMarkdownFiles()`, then maintained
incrementally on `vault.on('create' | 'modify' | 'delete' | 'rename')`. Backlinks
and graph are computed lazily from `outlinks` (forward edges → inverted on demand,
cached until any file changes).

### 5.2 Renderer pipeline

1. `gray-matter` → frontmatter + body
2. `markdown-it` with plugins:
   - `markdown-it-anchor` (heading IDs)
   - `markdown-it-footnote`
   - `markdown-it-task-lists`
   - Custom rule: `[[wikilink]]` and `![[embed]]`
   - Custom rule: `> [!note]`-style Obsidian callouts
   - `markdown-it-katex` for `$inline$` and `$$block$$`
   - Mermaid blocks: emit `<pre class="mermaid">` (rendered client-side)
3. Post-process: extract h2/h3 for the on-this-page TOC.
4. Wrap in template (header, three-column shell, footer) with computed sidebar nav,
   backlinks, tags, breadcrumbs.

### 5.3 HTTP server routes

| Route | Purpose |
|---|---|
| `GET /` | Home: hero (vault name, file count, tag cloud, recent notes) |
| `GET /<slug>` | Rendered note HTML |
| `GET /tags/` | All tags index |
| `GET /tags/<tag>` | Notes with this tag |
| `GET /graph/` | Full-vault graph view |
| `GET /search/` | Search page (renders shell; loads `/api/search-index.json`) |
| `GET /api/search-index.json` | MiniSearch document index |
| `GET /api/graph.json` | `{nodes, edges}` for D3 |
| `GET /assets/<...>` | Fonts (linked to Google Fonts), theme.css, client.js, katex.css |
| `GET /attachments/<...>` | Vault attachments (images, etc.) |
| `*` | 404 page (also styled) |

Server is single-threaded, no auth (loopback only by default). On settings change (port, bind),
it tears down and rebinds.

### 5.4 Client JS (`/assets/client.js`)

A small (~5–10 KB minified) script that:
- Wires the search input + ⌘K to open a popover that queries the MiniSearch index.
- On `/graph/`, lazy-loads `d3-force` from a vendored copy and renders the force graph.
- On any page with a `<pre class="mermaid">`, lazy-loads Mermaid.
- Highlights active link in left nav and active section in right TOC (intersection observer).
- Theme respects `prefers-color-scheme` only insofar as the default theme is light; no dark variant in v1.

## 6. Plugin lifecycle

```
onload():
  1. load settings
  2. register settings tab
  3. register ribbon icon, status bar item, commands
  4. build VaultIndex (async)
  5. start HttpServer
  6. wire vault events → index updates
  7. update status bar with URL

onunload():
  1. close server
  2. unwire events
  3. clear index
```

If port is already in use, retry next 5 ports, surface notice on failure.

## 7. Build & ship

- Standard Obsidian plugin layout: `manifest.json`, `main.ts`, `styles.css`,
  `versions.json`. Build with esbuild, target ES2018.
- Repo will follow the official template (`obsidianmd/obsidian-sample-plugin`)
  conventions so it can be submitted as a community plugin.
- Tests:
  - **Unit:** parser pipeline (wikilinks, embeds, callouts, frontmatter exclusion) — `vitest`.
  - **Fixture-based:** small synthetic vault under `tests/fixtures/` rendered → snapshot HTML compared.
  - **End-to-end:** spawn the server against a fixture vault, hit each route with `undici`, assert status & key DOM nodes exist.

## 8. Milestones (for the agent team)

| # | Milestone | Implementer delivers | QA verifies |
|---|---|---|---|
| 0 | Scaffold | Plugin manifest, esbuild config, TS skeleton, sample-plugin lifecycle | `npm run build` produces `main.js`; manifest valid |
| 1 | VaultIndex | Index module + tests, vault-event wiring, exclusion logic | Unit tests pass; index updates on synthetic events |
| 2 | Renderer | markdown-it pipeline w/ wikilinks, embeds, callouts, KaTeX, Mermaid stubs | Fixture vault renders to expected HTML snapshots |
| 3 | HTTP server | All routes implemented, theme CSS bundled, client.js | E2E tests hit each route, get expected status + DOM |
| 4 | Theme polish | Quiet Reference CSS matches mockup #02 pixel-near | Visual diff against mockup; spec compliance checklist |
| 5 | Settings + commands + ribbon | Settings tab, 2 commands, ribbon icon, status bar | Manual verification checklist; settings persist |
| 6 | Search + graph | MiniSearch index, D3 graph, both rendered with theme | Search returns hits; graph renders nodes ≥ N |
| 7 | Release prep | README, screenshots, license, version bump | Lint clean, all tests pass, manifest valid |

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Port collision | Retry 5 ports, surface clear notice |
| Large vaults (>10k notes) slow to index | Lazy backlinks computation; defer graph until `/graph/` requested |
| User vault has `publish: false` accidentally → invisible | Settings tab shows count of excluded notes |
| Loopback assumption broken (LAN exposure) | Default `127.0.0.1`, opt-in `0.0.0.0` with warning banner |
| Mermaid/D3 bundle weight | Lazy-load only on pages that need them |
| Obsidian internal markdown extensions (Dataview, Templater) | Out of scope; render block as code with notice |

## 10. Done criteria (v1)

- Plugin enables in a real vault, server starts, vault renders at the URL.
- Adding a new note in Obsidian → it appears in left nav and is reachable on next refresh.
- Renaming a note → old URL 404s, new URL works, backlinks update.
- All routes return 200 in the fixture e2e suite.
- Theme matches mockup #02 with no AI-template tells.
- Excluded notes (`publish: false`) do not appear anywhere in the wiki.
- Build is clean, lint clean, unit + e2e tests green.
