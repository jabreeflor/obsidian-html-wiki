# M7-QA — Final Acceptance Report

**Project:** `obsidian-html-wiki` v1.0.0
**Date:** 2026-05-09
**Reviewer:** qa
**Scope:** SPEC §10 done criteria + M7-QA task description

## Result: **PASS**

All 11 acceptance criteria met. The plugin meets the v1 done criteria in SPEC §10.

---

## Criterion-by-criterion verdict

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | manifest.json version is 1.0.0 | PASS | `manifest.json` line 4: `"version": "1.0.0"` |
| 2 | README.md with screenshots, install, settings, privacy, license | PASS | `README.md` 129 lines covers pitch, why-not-Publish, features, manual + BRAT install, usage, settings reference, privacy, FAQ, dev quickstart, MIT license footer. References `docs/screenshots/{note,graph,tag}.png` (all valid 2880x1800 PNGs, retina capture of 1440x900 viewport). |
| 3 | LICENSE is MIT | PASS | `LICENSE` is the standard MIT text, 2026 Jabree Flor. |
| 4 | `npm run build` clean | PASS | `prebuild` + `tsc -noEmit -skipLibCheck` + `esbuild production` exit 0. Plugin `main.js` = 3.6 MB; client emits 85 chunks (3024 KB total). First-load eager cost ~22 KB (entry chunk); mermaid (~1 MB) and d3-force (~50 KB) lazy on demand. |
| 5 | `npm test` all green | PASS | 66/66 tests pass: vault-index 14, renderer 11, server 19, theme 11, search 5, graph 6. ~7s wall time. |
| 6 | Type-check / lint clean | PASS | `npx tsc --noEmit` exits 0. No ESLint config in repo (project uses `tsc --noEmit` as the lint script — package.json:14). |
| 7 | No `console.log` in `src/` (allow `console.error`/`console.warn`) | PASS | 0 hits for `console.log` across `src/**/*.ts`. Allowed exceptions: 4 `console.error` calls in error-fallback paths (`src/main.ts:82`, `src/client/graph.ts:78`, `src/client/search.ts:145`, `src/client/main.ts:60`). 0 `console.warn` calls. |
| 8 | No TODO/FIXME/XXX in `src/` | PASS | 0 hits across `src/**/*.ts`. |
| 9 | Manual server flow against fixture vault | PASS | Spawned `build/dev-server.cjs` on 127.0.0.1:8485. Route results: `/` → 200, `/on-reading/boredom` → 200, `/tags/` → 200, `/tags/attention` → 200, `/graph/` → 200, `/search/` → 200, `/api/search-index.json` → 200 (8 visible docs, no private), `/api/graph.json` → 200 (8 nodes / 11 edges, no private), `/drafts/private-rant` → 404 (excluded note), `/no-such-note` → 404, `/assets/{theme.css,main.js,katex.css}` → 200. JSON parses cleanly; both APIs filter excluded notes. |
| 10 | New file appears in index without restart | PASS | Direct probe: building VaultIndex from fixture (8 visible) then calling `index.update({path:"On Reading/Freshly added.md", ...})` — exactly the call `main.ts:51` makes inside the `vault.on('create')` handler — increments visible count to 9, `bySlug("on-reading/freshly-added")` resolves immediately with title/slug/tags. The Obsidian `vault.on('create' \| 'modify' \| 'delete' \| 'rename')` wiring in `main.ts:51-77` was previously verified at M1-QA via `registerEvent` and `cachedRead`. |
| 11 | This report exists at `docs/QA-FINAL.md` | PASS | This file. |

---

## Live browser smoke (chrome-devtools-mcp)

- Home `/` (1280x800): title "Home — atlas", body class `theme-quiet-reference page-home`, left nav lists 8 visible notes, no console errors or warnings, no "A private rant" anywhere in the rendered chrome.
- Search `/search/`: typed "boredom" via `fill` (per-character input events) → 6 distinct hits, top result "The Calculus of Boredom" → `/on-reading/boredom`. Click navigates correctly. Race-condition fix confirmed: previous M6-QA run yielded 43 anchors / 7 distinct; the new serial-token guard in `src/client/search.ts:126-150` drops stale renders, now 6/6.
- ⌘K popover opens and closes cleanly on / via `Meta+k` and `Escape`.
- `/graph/`: SVG with 8 circles, 8 text labels, 11 line elements — matches API and visible-note count exactly. No "Private" in any node label.
- Mermaid lazy-loading verified at M6-QA: 0 mermaid chunks on `/on-reading/boredom`; 27 chunks including `chunk-mermaid.core-*` and `chunk-flowDiagram-*` on `/reference/math-and-diagrams`.

## Privacy (SPEC §3.4) end-to-end

`Drafts/Private rant.md` (frontmatter `publish: false`) is invisible from every surface:
- Site index (`/`) — left nav lists 8 notes, not 9.
- Direct URL `/drafts/private-rant` — 404, styled.
- Search — `/api/search-index.json` returns 8 docs, no "A private rant"; live MiniSearch search for "private rant" returns no matching hit.
- Graph — `/api/graph.json` has 8 nodes / 11 edges; no node title contains "Private"; no edge sources or targets the hidden path.
- Backlinks — verified at M1-QA: `backlinksFor("On Reading/Boredom.md")` excludes `Drafts/Private rant.md` even though that note links to Boredom.
- Wikilinks from a hidden note — verified at M2-QA: `[[Visible note]]` from inside an excluded note renders as `wikilink unresolved` (no leak via the link rel).

## Anti-tells (SPEC §4)

Re-confirmed at M4-QA: 0 hits for `#3B82F6` / tech blue, 0 hits for `purple`/`violet`, 0 emoji codepoints in `templates.ts`/`icons.ts`, 0 icon-font references, no card drop-shadows on chrome (only the `inset` accent stripe on active nav). Theme palette stays inside the spec tokens + 3 muted earth tones for callout kinds (ochre warning, dark-red danger, conifer-green success) + `#FBF1F1` for math-error background. Six hand-drawn 16px SVG icons (`icons.ts`) replace any emoji-as-icon temptation.

## Repo state

- Eight commits, each with a clear `M<n>:` subject; v1.0.0 release commit `aef29a3` is HEAD.
- Working tree clean.
- `versions.json` includes `"1.0.0": "1.5.0"`.
- `.gitignore` correctly excludes `build/`, `node_modules/`, `main.js`, and `src/theme/client-bundle.json` (regenerated by `prebuild`).

## Non-blocker observations carried over

1. Bundle size is 3.6 MB plugin / 22 KB first-load client / 1 MB lazy mermaid — within SPEC §5.4 / §9 lazy-loading guidance, although heavier than the original 5-10 KB target the spec mentioned (mermaid joining since). Acceptable for v1.
2. Loopback default is enforced (`bindAll: false` → `127.0.0.1`); the opt-in `0.0.0.0` setting carries the spec-required warning panel.
3. Port-collision retry (5 ports forward) tested at M3-QA with a synthetic blocker.
4. No telemetry or outbound network requests from the plugin; Google Fonts loaded by the browser when rendering a wiki page (called out in README privacy section).

## Recommendation

**Ship v1.0.0.** The plugin meets the spec. Two follow-ups worth tracking for a v1.1 milestone (not required by §10):

- Code-split mermaid behind a CDN load (the implementer floated this) — would shrink the plugin artifact by ~1 MB.
- SSE / live-reload so the browser refreshes automatically when a vault file changes (spec §3.2 already lists this as a v1.1 nicety).
