# Changelog

## Unreleased

## v0.5.0 - 2026-09-08

- Raised the minimum supported VS Code version to 1.136 (`engines.vscode` and `@types/vscode` are both `^1.136.0`). Installations older than 1.136 keep the last compatible release from the Marketplace instead of updating.
- Bumped dev dependency `@types/node` to 26.4.1.
- CI now runs `vsce package` after the build, so a manifest fault such as an `@types/vscode` newer than `engines.vscode` fails the pull request instead of surfacing in the release job.

## v0.4.0 - 2026-08-19

- Bumped dev dependencies: TypeScript 7.0 (the native compiler, distributed as platform binaries), esbuild 0.28.2, `@types/node` 26.2, ovsx 1.1; CI action `setup-node` v7. No runtime behaviour change (still zero runtime dependencies).

## v0.3.0 - 2026-06-22

- README: state up front that this is a Visual Studio Code extension and add Marketplace install instructions.
- README: add a demo GIF (`media/demo.gif`).

## v0.2.0 - 2026-06-22

Maintenance release: dependency upgrades and toolchain modernisation. No runtime behaviour change (still zero runtime dependencies).

- Bumped dev dependencies: TypeScript 6.0, esbuild 0.28, `@types/node` 26, ovsx 1.0; CI actions `checkout` v7 and `setup-node` v6. Resolves all open Dependabot advisories (0 vulnerabilities).
- Switched TypeScript to `node16` module resolution and explicit `node`/`vscode` type inclusion, as required by TypeScript 6.0 (the previous `node10` resolution and implicit `@types` inclusion are deprecated/removed).

## v0.1.0 - 2026-06-22

Initial release.

- Paste a URL in a Markdown file to insert `[Page Title](url)`; paste over a selection to use the selection as the label.
- Added the **Resolve Title for URL(s)** command (and editor context-menu entry) that turns bare URLs and empty `[](url)` links into titled links across the selection, or the current line when nothing is selected, honouring the `linkStyle` setting.
- Non-blocking: a placeholder link appears instantly and the label is swapped for the page title (or the URL's hostname on failure) in the background.
- Title resolution prefers `og:title`, decodes entities, follows redirects, and caps the body; sent with a link-preview-bot User-Agent (`Twitterbot/1.0`) by default to get past common bot-walls.
- Decodes titles with the page's character encoding (from `Content-Type` or `<meta charset>`, defaulting to UTF-8), so non-UTF-8 pages such as Shift_JIS, EUC-KR, GBK, Big5 and ISO-8859-1 yield correct titles. Redirects are followed only to `http(s)` targets.
- Proxy-aware via VS Code's `http.*` settings (patched global agent, with a stdlib `CONNECT`-tunnel fallback). Zero runtime dependencies.
- Configurable under `markdownLinkTitle.*`: `enabled`, `fetchTitle`, `timeoutMs`, `preferOpenGraph`, `maxRedirects`, `userAgent`, `placeholder`, `maxBodyKb`, `maxTitleLength`, and inline/reference `linkStyle`.
