// lib/articleExtraction.ts
//
// P5.2: turns raw fetched HTML into a bounded, plain-text candidate for the
// existing classification pipeline. Pure and network-free - the HTML
// string it receives has already been safely, boundedly fetched by
// lib/boundedFetch.ts. Uses node-html-parser, a pure text tokenizer (no
// script execution, no DOM, no browser) - added as the one new dependency
// this phase needed, since hand-rolled regex HTML parsing is fragile
// against adversarial/malformed markup in exactly the way a real parser
// isn't.
import { parse, HTMLElement } from "node-html-parser";

// Bounds what ever reaches the classifier - never the entire page, however
// long. Deliberately larger than Post.content's 1000-char limit (an
// article needs enough surrounding text for the existing claim-extraction
// classifier to find the actual assertion), but still a hard, small cap,
// not "the whole article."
export const MAX_EXTRACTED_TEXT_LENGTH = 4000;

// Removed before reading any text - never navigation chrome, form
// controls, or (most importantly) script/style content, which must never
// leak into what's presented as "page text."
const NON_CONTENT_SELECTORS = "script, style, nav, footer, form, noscript, header";

export type ArticleExtractionResult = {
  title: string | null;
  text: string;
};

function findContentRoot(root: HTMLElement): HTMLElement {
  // Conservative preference order per the P5.2 spec: article, then main,
  // then whatever body text remains after stripping chrome - never a
  // bespoke "readability" heuristic that could quietly latch onto the
  // wrong section of an unfamiliar page's markup.
  return (
    root.querySelector("article") ||
    root.querySelector("main") ||
    root.querySelector("body") ||
    root
  );
}

export function extractArticleContent(html: string): ArticleExtractionResult {
  const root = parse(html, {
    // node-html-parser never executes anything regardless of these flags -
    // it is a pure tokenizer/tree builder, not a browser or VM - but
    // keeping comment/script node bodies out of the tree at all is one
    // less thing to remember to strip below.
    comment: false,
  });

  const titleText = root.querySelector("title")?.textContent?.trim();
  const title = titleText ? titleText : null;

  root.querySelectorAll(NON_CONTENT_SELECTORS).forEach((el) => el.remove());

  const contentRoot = findContentRoot(root);
  const rawText = contentRoot.textContent || "";
  const normalized = rawText.replace(/\s+/g, " ").trim();
  const text =
    normalized.length > MAX_EXTRACTED_TEXT_LENGTH
      ? normalized.slice(0, MAX_EXTRACTED_TEXT_LENGTH)
      : normalized;

  return { title, text };
}
