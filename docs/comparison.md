# How this extension compares

There are several VS Code extensions that turn URLs into Markdown links. This page explains where Markdown Link Title fits and why it was written, comparing it both to [PasteURL](https://github.com/kukushi/PasteURL) (the closest paste-on-clipboard extension) and to the smaller "fetch the title" extensions.

## Two ways to make a link, in one extension

Most of these extensions do one of two things; this one does both:

- **On paste** turn a pasted URL into `[Page Title](url)` (the headline feature, via VS Code's native paste pipeline).
- **On demand** run the **Resolve Title for URL(s)** command to turn bare URLs and empty `[](url)` links already in the document into titled links, over the selection or the current line.

## PasteURL

The closest existing extension is [PasteURL](https://github.com/kukushi/PasteURL). We built our own because, compared to it, this extension:

- **Needs no Linux install.** It reads the pasted text from the editor, so no `xclip`/`xsel`/`wl-clipboard` is required (PasteURL's native `copy-paste` module silently does nothing without `xclip`).
- **Has zero runtime dependencies.** Only the VS Code API and the Node standard library, versus PasteURL's deprecated `request` and a large transitive tree with open, unmerged Dependabot security PRs (as of 2026-06-19).
- **Honours `http.*` proxy settings.** Requests route through VS Code's own proxy support, so it works behind a corporate proxy with no extra configuration.
- **Is cross-platform.** No native modules and no shelling out; one bundle works on Windows, macOS and Linux.

### How it compares on PasteURL's reported issues

The table maps PasteURL's own GitHub issues to this extension's behaviour. We are better or equal on every one that affects normal use.

| PasteURL issue | Symptom there | This extension | Verdict |
| --- | --- | --- | --- |
| [#48](https://github.com/kukushi/PasteURL/issues/48) | "Not a URL" error after a recent VS Code update (native clipboard module broke) | Reads the pasted text from the editor's paste pipeline, so there is no native clipboard module to break | Better |
| [#2](https://github.com/kukushi/PasteURL/issues/2) | `gb2312` page title pasted as mojibake | Decodes the page's charset (`Content-Type` or `<meta charset>`, e.g. GB2312/GBK, Shift_JIS, Big5, EUC-KR), defaulting to UTF-8 | Better |
| [#22](https://github.com/kukushi/PasteURL/issues/22), [#46](https://github.com/kukushi/PasteURL/issues/46) | Label becomes the literal text `Error Happened` on failure | Falls back to the URL's hostname, e.g. `[example.com](url)`, so the link is always usable | Better |
| [#21](https://github.com/kukushi/PasteURL/issues/21), [#41](https://github.com/kukushi/PasteURL/issues/41) | Apostrophes/entities left HTML-encoded, e.g. `Conway&#039;s` | Decodes named and numeric HTML entities | Better |
| [#45](https://github.com/kukushi/PasteURL/issues/45) | Reddit link labelled `302 Found` | Follows redirects and uses a link-preview-bot User-Agent to read `og:title`; never inserts a status string | Better |
| [#5](https://github.com/kukushi/PasteURL/issues/5), [#8](https://github.com/kukushi/PasteURL/issues/8) | YouTube titles not retrieved | The preview-bot User-Agent gets YouTube's `og:title` | Equal/Better |
| [#42](https://github.com/kukushi/PasteURL/issues/42) | Title does not update after paste | A placeholder is swapped for the real title once the background fetch returns | Better |
| [#55](https://github.com/kukushi/PasteURL/issues/55) | Asks for Dependabot / vulnerability-free dependencies | Zero runtime dependencies, plus Dependabot enabled in CI | Better |
| [#54](https://github.com/kukushi/PasteURL/issues/54) | Asks to publish on Open VSX | Published to Open VSX by the release workflow | Equal |
| [#9](https://github.com/kukushi/PasteURL/issues/9), [#12](https://github.com/kukushi/PasteURL/issues/12) | Dependency hygiene; lost keybinding | No runtime deps, and it rides VS Code's native paste with no custom keybinding to break | Better |

Out of scope by design (not goals of this extension): local file-system paths ([#20](https://github.com/kukushi/PasteURL/issues/20)) and drag-and-drop from the Explorer ([#3](https://github.com/kukushi/PasteURL/issues/3)); this extension only turns `http(s)` URLs into Markdown links.

## Other title-fetching extensions

These three extensions all fetch a page title and build a Markdown link, but each falls short of what Markdown Link Title offers. Verified on 2026-06-22.

| Extension | What it does | How it differs from this extension |
| --- | --- | --- |
| [Markdown Auto Link Title](https://marketplace.visualstudio.com/items?itemName=36.markdown-auto-link-title) (`36.markdown-auto-link-title`) | Converts a pasted URL into a titled Markdown link. | Its linked source repository, `https://github.com/CoreOrigin/markdown-auto-link-title`, returns **404**, so the code cannot be audited; ours is open and fully auditable. It is paste-only with no on-demand command, no proxy support, and no configuration. |
| [Url Title](https://marketplace.visualstudio.com/items?itemName=usernamehw.url-title) (`usernamehw.url-title`) | Fetches the page title for a URL and writes a Markdown link. | It works **only** through the `urlTitle.run` command, not on paste, so a plain paste leaves a bare URL. This extension does both: titles appear automatically on paste, and the **Resolve Title for URL(s)** command covers the on-demand case. |
| [URL title resolver for Markdown](https://marketplace.visualstudio.com/items?itemName=capybara1.vscode-url-title-resolver) (`capybara1.vscode-url-title-resolver`) | A "Resolve title for URL(s)" command that titles plain URLs and empty `[](url)` links in the selection. | This is the model for our **Resolve Title for URL(s)** command, but that extension has had **no update since January 2021**, offers no settings, and has no paste integration. Ours adds paste support, proxy awareness, charset/entity decoding, redirect handling, a configurable User-Agent, and inline/reference link styles. |
