# VeriVerse Browser Extension (P5.4)

A minimal Manifest V3 extension for Chrome, Edge, Brave, and other
Chromium-based browsers. **It does not verify anything itself.** It only
builds a "Share to VeriVerse" deep link - the same contract introduced in
P5.3 (`lib/shareToVeriVerseLink.ts`) - from whatever the browser already
knows about the current tab or your text selection, and opens
`https://www.veriverse.io/verify` with that content pre-filled for you to
review and, if you choose, verify yourself.

## What it does

- **Toolbar icon click**: opens VeriVerse's Verify page pre-filled with
  the current tab's URL and title.
- **Right-click a text selection -> "Verify with VeriVerse"**: opens
  VeriVerse's Verify page pre-filled with your selected text, plus the
  current tab's URL and title as extra context.

In both cases, the page that opens is inert until you press "Verify"
yourself - the extension's job is already finished once that tab opens.

## What it does NOT do

- It never calls `/api/verify` or any other VeriVerse API.
- It never fetches page content, calls OpenAI/Tavily, or reads Claim or
  TrustAssessment data.
- It never creates a Post.
- It never authenticates you or touches your VeriVerse session.
- It never stores, logs, or transmits your selection or browsing history
  anywhere - the only thing it does with the text/URL/title it reads is
  place them into the query string of the one new tab it opens.
- It has no content scripts and injects nothing into any page you visit.

## Loading it (development / unpacked)

1. Open `chrome://extensions` (or the Edge/Brave equivalent).
2. Enable "Developer mode".
3. Click "Load unpacked" and select this `browser-extension/` folder.
4. Pin the VeriVerse icon to your toolbar for one-click access.

Not published to the Chrome Web Store in this phase - unpacked loading
only.

## Permissions

- `contextMenus` - to add the "Verify with VeriVerse" right-click item.
- `activeTab` - to read the current tab's URL/title only at the moment
  you click the toolbar icon or the context-menu item; no access outside
  that single interaction, and no access to any other tab.

Deliberately not requested: `tabs`, `<all_urls>` or any host permission,
`webRequest`, `cookies`, `storage`, `history`, `downloads`, `scripting`.

## Icons

Generated as static PNGs (16/32/48/128px) from the existing
`app/icon.svg` used by the main VeriVerse app, since Chrome's extension
icon fields require raster images rather than SVG. No new branding was
created for this phase.

## Tests

Focused, dependency-free tests live in `tests/` and run with Node's
built-in test runner - no build step, no shared config with the Next.js
app's Vitest/Playwright suites:

```
node --test browser-extension/tests/
```
