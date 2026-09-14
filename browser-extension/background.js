// browser-extension/background.js
//
// P5.4: the entire "verification" behavior of this extension is - build a
// VeriVerse deep link from whatever the browser already handed this event
// (a text selection, the active tab's URL/title), then open it in a new
// tab. Nothing here fetches, classifies, resolves a Claim, calls any
// VeriVerse API, or creates a Post - see lib/buildVeriVerseLink.js for the
// (also side-effect-free) link-building logic this file just wires up to
// two Chrome events. No polling, no persistent state, no content scripts.
import {
  buildVeriVerseUrl,
  buildToolbarShareParams,
  buildContextMenuShareParams,
} from "./lib/buildVeriVerseLink.js";

const CONTEXT_MENU_ID = "verify-with-veriverse";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Verify with VeriVerse",
    contexts: ["selection"],
  });
});

// Toolbar icon click: current page only, no selection involved.
chrome.action.onClicked.addListener((tab) => {
  const params = buildToolbarShareParams(tab);
  chrome.tabs.create({ url: buildVeriVerseUrl(params) });
});

// Context-menu click on a text selection.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  const params = buildContextMenuShareParams(info, tab);
  chrome.tabs.create({ url: buildVeriVerseUrl(params) });
});
