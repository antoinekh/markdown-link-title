# Markdown Link Title

*A Visual Studio Code extension.* Install it from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=antoinekh.markdown-link-title), or from the command line with `code --install-extension antoinekh.markdown-link-title`.

Paste a URL into a Markdown file and get `[Page Title](url)` instead of a bare link. A small, fully auditable VS Code extension with **zero runtime dependencies** that honours your VS Code proxy settings.

## What it does

- **Paste a URL over a selection** wraps the selected text as the label: `[selection](url)`. No network call.
- **Paste a URL with no selection** inserts a placeholder link `[fetching…](url)` instantly, with the cursor after it so you can keep typing, then swaps `fetching…` for the page title as soon as the background fetch returns. The paste never blocks.
- **If the fetch times out or fails** (unreachable host, non-success status), the placeholder is replaced with the URL's hostname, e.g. `[github.com](https://github.com/...)`, so you still get a usable link.
- **If title fetching is disabled** (`markdownLinkTitle.fetchTitle: false`), it inserts `[](url)` with the cursor between the brackets for you to type a label, with no network call.

It uses VS Code's native paste pipeline (`DocumentPasteEditProvider`). Because the fetch runs in the background after the paste is applied (rather than blocking the paste), there is no spinner and typing is never interrupted; the title simply appears in place a moment later.

## Resolve titles on demand

Besides paste, the **Markdown Link Title: Resolve Title for URL(s)** command (also on the editor right-click menu when text is selected) titles links that are already in the document. It turns every bare `http(s)` URL and every empty Markdown link `[](url)` into `[Page Title](url)`, fetching each title once and falling back to the hostname on failure. It runs over the selected text, or, with no selection, over the current line. Links that already have a label are left untouched, and the `linkStyle` setting is honoured (so `reference` produces `[title][N]` plus the `[N]: url` definitions).

## Character encodings

Titles are decoded with the correct character encoding, so non-English pages come out right. UTF-8 (the modern default, which covers every alphabet including Japanese, Korean, Chinese, Arabic, Cyrillic, …) always works, and legacy encodings such as Shift_JIS, EUC-JP, EUC-KR, GBK, Big5 and ISO-8859-1 are handled too. The charset is taken from the response's `Content-Type` header, then from a `<meta charset>` declaration in the page, falling back to UTF-8. This uses the Node `TextDecoder`, so it still needs no dependencies.

## Why a new extension

Several VS Code extensions turn URLs into Markdown links, but each falls short: PasteURL needs `xclip` on Linux and ships a deprecated dependency tree, [Markdown Auto Link Title](https://marketplace.visualstudio.com/items?itemName=36.markdown-auto-link-title) has no auditable source (its GitHub repo 404s), [Url Title](https://marketplace.visualstudio.com/items?itemName=usernamehw.url-title) only runs as a command and not on paste, and [URL title resolver for Markdown](https://marketplace.visualstudio.com/items?itemName=capybara1.vscode-url-title-resolver) has had no update since 2021. This extension covers both paste and on-demand resolution, with zero runtime dependencies and full proxy support.

See [docs/comparison.md](docs/comparison.md) for the detailed comparison, including a table mapping PasteURL's own reported issues to this extension's behaviour.

## Settings

All settings live under `markdownLinkTitle.*`:

| Setting | Type | Default | Purpose |
| --- | --- | --- | --- |
| `markdownLinkTitle.enabled` | boolean | `true` | Master on/off switch. |
| `markdownLinkTitle.fetchTitle` | boolean | `true` | Fetch the page title. When off, inserts an empty label for you to type. |
| `markdownLinkTitle.timeoutMs` | number | `5000` | Fetch timeout in milliseconds. |
| `markdownLinkTitle.preferOpenGraph` | boolean | `true` | Prefer `og:title` over `<title>` when both are present. |
| `markdownLinkTitle.maxRedirects` | number | `5` | Maximum redirects to follow. |
| `markdownLinkTitle.userAgent` | string | `""` | User-Agent sent with the fetch. Empty uses the default link-preview bot (`Twitterbot/1.0`), which sites whitelist for `og:title`. |
| `markdownLinkTitle.placeholder` | string | `fetching…` | Temporary label shown while the title loads. |
| `markdownLinkTitle.maxBodyKb` | number | `512` | Maximum response body read, in KB, while looking for the title. |
| `markdownLinkTitle.maxTitleLength` | number | `0` | Truncate a fetched title to this many characters (word boundary + ellipsis). `0` disables truncation. |
| `markdownLinkTitle.linkStyle` | string | `inline` | `inline` for `[title](url)`, or `reference` for `[title][1]` with `[1]: url` collected at the end of the file. |

## Default User-Agent

The title fetch is sent with the User-Agent `Twitterbot/1.0` by default. This is deliberate: many popular sites (Unsplash, Reddit, Cloudflare-fronted pages, …) serve a JavaScript bot-wall to browser or unknown User-Agents, which a static fetch can never pass, so you would only ever get their challenge page. The same sites whitelist link-unfurling bots such as Twitterbot and Slackbot so their links preview nicely in chat and social apps, and they hand those bots clean `og:title` metadata, which is exactly the title this extension wants. Using a preview-bot User-Agent therefore returns the real title where a browser string fails.

Override it with `markdownLinkTitle.userAgent` if you prefer (for example a browser string, or `Slackbot`, which works equally well); leaving the setting empty uses the `Twitterbot/1.0` default.

## Proxy support

When `http.proxySupport` is at its default (`override`) or `on`, the extension uses the default Node agent, which the VS Code extension host has already patched to honour your proxy, including PAC scripts, system proxy, and authenticated proxies (Basic, NTLM, Kerberos). You do not need to configure anything beyond the standard `http.*` settings.

Only when `http.proxySupport` is `off` does the extension resolve the proxy itself, from `http.proxy` then the `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY` (and `NO_PROXY`) environment variables, using a standard-library `CONNECT` tunnel. This minimal fallback supports an explicit proxy with optional Basic auth only.

## Development

```bash
npm install
npm run compile    # type-check and emit to out/ (also used by tests)
npm test           # run unit tests with node --test
npm run bundle     # bundle to dist/extension.js with esbuild
npm run package    # production bundle for packaging into a .vsix
```

Press `F5` in VS Code to launch an Extension Development Host and try it in a Markdown file.

The pure logic (`url.ts`, `titleParser.ts`, `references.ts`, `selectionLinks.ts`, and the proxy resolution in `http.ts`) imports no `vscode` API, so it is unit-tested directly.

## Releasing

CI (`.github/workflows/ci.yml`) runs the tests and a production build on Linux, macOS and Windows for every push and pull request. To publish to the VS Code Marketplace, bump `version` in `package.json`, then push a matching tag:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

The release workflow (`.github/workflows/release.yml`) packages the extension once and publishes it on tags matching `v*`:

- **VS Code Marketplace** via `vsce`, using a Personal Access Token in the `VSCE_PAT` repository secret.
- **Open VSX** (`open-vsx.org`) via `ovsx`, using a token in the `OVSX_PAT` repository secret. This step is skipped when `OVSX_PAT` is not set, so it is optional. Publishing to Open VSX also requires a one-time claimed namespace matching the `publisher` in `package.json`.
