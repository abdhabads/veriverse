import { TemporalScope, extractTemporalScope, extractJurisdiction } from "@/lib/claimNormalization";

// Deterministic-first proposition extraction (Sprint 4, Phase 3). Like
// lib/claimNormalization.ts, this is deliberately NOT an LLM call - the
// architecture below (ExtractedField's `method`) is designed so an
// "ai_assisted" extractor could plug in later as a CANDIDATE alongside this
// one, but nothing here treats an LLM as authoritative, and no such
// extractor is implemented this sprint. Only "deterministic" and
// "unresolved" methods actually occur in this file's output today.
//
// The unifying rule throughout: when a signal isn't clearly, deterministically
// present, the field is `unresolved` (value: null, confidence: 0), never a
// guess. This mirrors Sprint 2's "false merging is worse than under-
// resolution" principle applied one level down, to proposition structure
// instead of claim identity.

export const PROPOSITION_SCHEMA_VERSION = "proposition-v1";
export const EXTRACTION_MODEL_VERSION = "deterministic-extractor-v1";
export const NORMALIZATION_VERSION = "claim-normalization-v1"; // tracks lib/claimNormalization.ts's own logic version

export type ExtractionMethod = "deterministic" | "ai_assisted" | "unresolved";

export type TextSpan = { start: number; end: number };

export type ExtractedField<T> = {
  value: T | null;
  confidence: number;
  method: ExtractionMethod;
  sourceTextSpan: TextSpan | null;
};

function unresolvedField<T>(): ExtractedField<T> {
  return { value: null, confidence: 0, method: "unresolved", sourceTextSpan: null };
}

export type NegationValue = "true" | "false" | "unknown";

export type QuantityType =
  | "absolute"
  | "percentage"
  | "percentage_point_change"
  | "percent_change"
  | "currency"
  | "range";

export type QuantityValue = {
  quantityType: QuantityType;
  value: number | null;
  fromValue: number | null;
  toValue: number | null;
  unit: string | null;
  direction: "increase" | "decrease" | null;
  // "about 30%" and "exactly 30%" are not the same claim - without this,
  // both extracted identically to {value: 30}. Found via the Sprint 4
  // benchmark (tests/benchmark/vvb-mini) before this field existed.
  isApproximate: boolean;
};

const APPROXIMATION_MARKERS =
  /\b(about|around|approximately|roughly|nearly|almost|close to|more or less)\b/i;

function detectApproximate(text: string): boolean {
  return APPROXIMATION_MARKERS.test(text);
}

export type AttributionValue = {
  isAttributed: boolean;
  speaker: string | null;
};

export type ModalityValue = "asserted" | "possible" | "necessary" | "predicted" | "recommended";
export type ConditionalityValue = "unconditional" | "conditional";

export type EntityMention = {
  text: string;
  span: TextSpan;
  resolved: boolean;
  entityType: "place" | "organization" | "unknown";
  entityId: string | null;
};

export type PropositionComponent = {
  componentIndex: number;
  propositionText: string;
  sourceTextSpan: TextSpan;
  subject: ExtractedField<string>;
  predicate: ExtractedField<string>;
  object: ExtractedField<string>;
  entities: EntityMention[];
  quantity: ExtractedField<QuantityValue>;
  negation: ExtractedField<NegationValue>;
  attribution: ExtractedField<AttributionValue>;
  modality: ExtractedField<ModalityValue>;
  conditionality: ExtractedField<ConditionalityValue>;
  temporalScope: TemporalScope;
  jurisdiction: string | null;
};

// ---------------------------------------------------------------------------
// Negation (Phase 5)
// ---------------------------------------------------------------------------

const NEGATION_MARKERS =
  /\b(not|n't|never|no evidence that|false that|isn't|wasn't|aren't|weren't|won't|didn't|doesn't|don't|cannot|can't|without)\b/i;

// Known gap, not attempted: double negatives ("not uncommon"), hedged
// uncertainty ("it's unclear whether X happened") are not distinguished from
// plain positive/negative - both would currently read as "false" (no marker
// found) or "true" (marker found) respectively, neither of which is right
// for a genuine hedge. Represented honestly as a limitation, not solved.
export function extractNegation(text: string): ExtractedField<NegationValue> {
  const match = text.match(NEGATION_MARKERS);
  if (match) {
    return {
      value: "true",
      confidence: 0.8,
      method: "deterministic",
      sourceTextSpan: { start: match.index ?? 0, end: (match.index ?? 0) + match[0].length },
    };
  }
  return { value: "false", confidence: 0.7, method: "deterministic", sourceTextSpan: null };
}

// ---------------------------------------------------------------------------
// Quantity (Phase 4) - correct REPRESENTATION, not arithmetic reasoning.
// ---------------------------------------------------------------------------

const DIRECTION_INCREASE = /\b(rose|rise|rising|increased?|increasing|grew|grow|growing|up|gained?|jumped?)\b/i;
const DIRECTION_DECREASE = /\b(fell|fall|falling|decreased?|decreasing|dropped?|dropping|declined?|declining|down|shrank|shrunk|cut)\b/i;

function detectDirection(text: string): "increase" | "decrease" | null {
  if (DIRECTION_INCREASE.test(text)) return "increase";
  if (DIRECTION_DECREASE.test(text)) return "decrease";
  return null;
}

// Checked in this priority order - most specific pattern first, so e.g. a
// "percentage points" phrase is never misread as a plain percentage.
const RANGE_PATTERN = /from\s+(\d+(?:\.\d+)?)\s*%?\s+to\s+(\d+(?:\.\d+)?)\s*%/i;
const RANGE_DASH_PATTERN = /(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*%/;
const PERCENTAGE_POINT_PATTERN = /(\d+(?:\.\d+)?)\s*(?:percentage\s*points?|pp\b|points?\s+percentage)/i;
// Note: \b is placed only after the word alternatives ("percent"), never
// after the literal "%" - "%" and a following punctuation mark (e.g. the
// "." in "30%.") are both non-word characters, so \b never matches between
// them and a pattern like `(?:%|percent)\b` silently fails to match "30%."
// while matching "30 percent" fine. Found via smoke-testing before writing
// any tests against this file.
const PERCENT_BY_PATTERN = /\bby\s+(\d+(?:\.\d+)?)\s*(?:%|percent\b)/i;
const PLAIN_PERCENT_PATTERN = /(\d+(?:\.\d+)?)\s*(?:%|percent(?:age)?\b)/i;
const CURRENCY_PATTERN =
  /([₦£€₹₩$])\s?(\d+(?:[.,]\d+)?)\s*(billion|million|thousand|trillion)?/i;

export function extractQuantity(text: string): ExtractedField<QuantityValue> {
  const isApproximate = detectApproximate(text);

  const rangeMatch = text.match(RANGE_PATTERN) || text.match(RANGE_DASH_PATTERN);
  if (rangeMatch) {
    return {
      value: {
        quantityType: "range",
        value: null,
        fromValue: Number(rangeMatch[1]),
        toValue: Number(rangeMatch[2]),
        unit: "%",
        direction: detectDirection(text) ?? (Number(rangeMatch[2]) > Number(rangeMatch[1]) ? "increase" : "decrease"),
        isApproximate,
      },
      confidence: 0.75,
      method: "deterministic",
      sourceTextSpan: { start: rangeMatch.index ?? 0, end: (rangeMatch.index ?? 0) + rangeMatch[0].length },
    };
  }

  const ppMatch = text.match(PERCENTAGE_POINT_PATTERN);
  if (ppMatch) {
    return {
      value: {
        quantityType: "percentage_point_change",
        value: Number(ppMatch[1]),
        fromValue: null,
        toValue: null,
        unit: "percentage_points",
        direction: detectDirection(text),
        isApproximate,
      },
      confidence: 0.8,
      method: "deterministic",
      sourceTextSpan: { start: ppMatch.index ?? 0, end: (ppMatch.index ?? 0) + ppMatch[0].length },
    };
  }

  const percentByMatch = text.match(PERCENT_BY_PATTERN);
  const direction = detectDirection(text);
  if (percentByMatch && direction) {
    return {
      value: {
        quantityType: "percent_change",
        value: Number(percentByMatch[1]),
        fromValue: null,
        toValue: null,
        unit: "%",
        direction,
        isApproximate,
      },
      confidence: 0.7,
      method: "deterministic",
      sourceTextSpan: { start: percentByMatch.index ?? 0, end: (percentByMatch.index ?? 0) + percentByMatch[0].length },
    };
  }

  const plainPercentMatch = text.match(PLAIN_PERCENT_PATTERN);
  if (plainPercentMatch) {
    return {
      value: {
        quantityType: "percentage",
        value: Number(plainPercentMatch[1]),
        fromValue: null,
        toValue: null,
        unit: "%",
        direction,
        isApproximate,
      },
      confidence: 0.85,
      method: "deterministic",
      sourceTextSpan: {
        start: plainPercentMatch.index ?? 0,
        end: (plainPercentMatch.index ?? 0) + plainPercentMatch[0].length,
      },
    };
  }

  const currencyMatch = text.match(CURRENCY_PATTERN);
  if (currencyMatch) {
    return {
      value: {
        quantityType: "currency",
        value: Number(String(currencyMatch[2]).replace(",", ".")),
        fromValue: null,
        toValue: null,
        unit: `${currencyMatch[1]}${currencyMatch[3] ? ` ${currencyMatch[3]}` : ""}`,
        direction,
        isApproximate,
      },
      confidence: 0.75,
      method: "deterministic",
      sourceTextSpan: { start: currencyMatch.index ?? 0, end: (currencyMatch.index ?? 0) + currencyMatch[0].length },
    };
  }

  return unresolvedField<QuantityValue>();
}

// ---------------------------------------------------------------------------
// Attribution (Phase 8) - deliberately NOT folded into claim identity, see
// the Sprint 4 report for why that's a documented open question rather than
// a silent decision either way.
// ---------------------------------------------------------------------------

// "states" is excluded when it's the plural noun in "United States"/"member
// states" rather than the reported-speech verb ("The minister states that
// ...") - found via Sprint 5.5's diagnostic as a real false positive on
// "The unemployment rate in the United States fell below 4% in 2023.",
// which has no attribution language at all but matched "United [S]tates"
// as speaker="The unemployment rate in the United", verb="states". No
// other verb in this list collides with a common proper noun this way, so
// this exclusion is scoped to "states" only, not applied broadly.
const ATTRIBUTION_PATTERN =
  /^(according to|as reported by)\s+([^,]+),\s*(.*)$|^(.+?)\s+(said|says|claimed|claims|reported|reports|stated|(?<!united\s)(?<!member\s)states|alleged|alleges|announced|announces|declared|declares)\s+(?:that\s+)?(.*)$/i;

export function extractAttribution(text: string): ExtractedField<AttributionValue> {
  const match = text.match(ATTRIBUTION_PATTERN);
  if (match) {
    const speaker = (match[2] || match[4] || "").trim();
    if (speaker) {
      const start = text.indexOf(speaker);
      return {
        value: { isAttributed: true, speaker },
        confidence: 0.65,
        method: "deterministic",
        sourceTextSpan: start >= 0 ? { start, end: start + speaker.length } : null,
      };
    }
  }
  return {
    value: { isAttributed: false, speaker: null },
    confidence: 0.6,
    method: "deterministic",
    sourceTextSpan: null,
  };
}

// ---------------------------------------------------------------------------
// Modality / conditionality
// ---------------------------------------------------------------------------

const MODAL_PATTERNS: Array<[ModalityValue, RegExp]> = [
  ["necessary", /\b(must|has to|have to|required to)\b/i],
  ["recommended", /\b(should|recommended?|advis(?:ed|able))\b/i],
  ["predicted", /\b(will|is (?:expected|predicted|projected|forecast) to|going to)\b/i],
  ["possible", /\b(might|may|could|possibly|potentially)\b/i],
];

export function extractModality(text: string): ExtractedField<ModalityValue> {
  for (const [modality, pattern] of MODAL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        value: modality,
        confidence: 0.7,
        method: "deterministic",
        sourceTextSpan: { start: match.index ?? 0, end: (match.index ?? 0) + match[0].length },
      };
    }
  }
  return { value: "asserted", confidence: 0.6, method: "deterministic", sourceTextSpan: null };
}

const CONDITIONAL_PATTERN = /\b(if|unless|provided that|assuming|as long as)\b/i;

export function extractConditionality(text: string): ExtractedField<ConditionalityValue> {
  const match = text.match(CONDITIONAL_PATTERN);
  if (match) {
    return {
      value: "conditional",
      confidence: 0.75,
      method: "deterministic",
      sourceTextSpan: { start: match.index ?? 0, end: (match.index ?? 0) + match[0].length },
    };
  }
  return { value: "unconditional", confidence: 0.6, method: "deterministic", sourceTextSpan: null };
}

// ---------------------------------------------------------------------------
// Entities (Phase 6) - deliberately NOT a real NER/entity-resolution system.
// Extracts capitalized-phrase spans as candidate mentions; resolves a
// mention ONLY against the small, curated place lookup already used for
// jurisdiction (lib/claimNormalization.ts). Everything else stays
// unresolved - including genuinely ambiguous names like "Apple" or two
// people/places sharing a name, which this system cannot and does not
// attempt to disambiguate. Under-resolution is the intended, safe default.
// ---------------------------------------------------------------------------

const CAPITALIZED_PHRASE_PATTERN = /\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*\b/g;

const KNOWN_PLACE_ENTITIES: Array<[RegExp, string]> = [
  [/^nigeria$/i, "NG"],
  [/^(united kingdom|britain)$/i, "GB"],
  [/^(united states|usa)$/i, "US"],
  [/^india$/i, "IN"],
  [/^china$/i, "CN"],
];

export function extractEntities(text: string): EntityMention[] {
  const mentions: EntityMention[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const pattern = new RegExp(CAPITALIZED_PHRASE_PATTERN);
  while ((match = pattern.exec(text)) !== null) {
    const candidate = match[0];
    // Sentence-initial capitalization is genuinely ambiguous ("Apple
    // announced..." vs "Inflation rose...") and this is not attempting real
    // part-of-speech tagging to resolve it - candidates are captured either
    // way. That's safe rather than reckless: an unresolved mention is inert
    // (nothing merges on it), so over-capturing costs only noise in this
    // array, never a false entity match.
    if (seen.has(candidate)) continue;
    seen.add(candidate);

    const known = KNOWN_PLACE_ENTITIES.find(([pattern2]) => pattern2.test(candidate));
    mentions.push({
      text: candidate,
      span: { start: match.index, end: match.index + candidate.length },
      resolved: Boolean(known),
      entityType: known ? "place" : "unknown",
      entityId: known ? known[1] : null,
    });
  }
  return mentions;
}

// ---------------------------------------------------------------------------
// Subject / predicate / object (Phase 2) - a narrow, conservative first
// layer. Only recognizes a small fixed list of common assertion verbs; any
// sentence that doesn't contain one of them produces unresolved S/P/O rather
// than a guess. This is NOT a parser - it will miss most real sentence
// structures by design, in favor of never fabricating a wrong answer.
// ---------------------------------------------------------------------------

const SVO_VERBS = [
  "approved", "approve", "approves", "rejected", "reject", "rejects",
  "denied", "deny", "denies", "confirmed", "confirm", "confirms",
  "announced", "announce", "announces", "allocated", "allocate", "allocates",
  "increased", "increase", "increases", "decreased", "decrease", "decreases",
  "caused", "cause", "causes", "signed", "sign", "signs",
  "stated", "state", "states", "reported", "report", "reports",
  "found", "find", "finds", "showed", "show", "shows",
  "said", "say", "says", "claimed", "claim", "claims",
  "won", "win", "wins", "lost", "lose", "loses",
  "launched", "launch", "launches", "banned", "ban", "bans",
  "passed", "pass", "passes", "cut", "cuts", "raised", "raise", "raises",
  "killed", "kill", "kills", "injured", "injure", "injures", "is", "was",
];

const SVO_VERB_PATTERN = new RegExp(`\\b(${SVO_VERBS.join("|")})\\b`, "i");

export function extractSVO(text: string): {
  subject: ExtractedField<string>;
  predicate: ExtractedField<string>;
  object: ExtractedField<string>;
} {
  const match = text.match(SVO_VERB_PATTERN);
  if (!match || match.index === undefined) {
    return { subject: unresolvedField(), predicate: unresolvedField(), object: unresolvedField() };
  }

  const verbStart = match.index;
  const verbEnd = verbStart + match[0].length;
  const subjectText = text.slice(0, verbStart).trim().replace(/[,.]$/, "");
  const objectText = text.slice(verbEnd).trim().replace(/^[,.]/, "");

  // An empty subjectText means the verb sits at the very start of this text
  // (e.g. the second clause of "X did A and did B", with the subject elided
  // and expected to be inherited from elsewhere - see
  // extractPropositionComponents). That's a legitimate reason for subject
  // to be unresolved on its own, but it says nothing about whether the verb
  // itself was found - predicate/object must not be discarded because of it.
  return {
    subject: subjectText
      ? { value: subjectText, confidence: 0.55, method: "deterministic", sourceTextSpan: { start: 0, end: verbStart } }
      : unresolvedField(),
    predicate: {
      value: match[0].toLowerCase(),
      confidence: 0.65,
      method: "deterministic",
      sourceTextSpan: { start: verbStart, end: verbEnd },
    },
    object: objectText
      ? { value: objectText, confidence: 0.5, method: "deterministic", sourceTextSpan: { start: verbEnd, end: text.length } }
      : unresolvedField(),
  };
}

// ---------------------------------------------------------------------------
// Compound claim segmentation (Phase 9) - conservative by construction: a
// candidate split point only becomes a real split when BOTH resulting
// halves contain a recognizable assertion verb (hasRecognizableVerb, below -
// deliberately looser than full extractSVO resolution, since the second
// clause of "X did A and did B" has no subject of its own to resolve; see
// extractPropositionComponents for how that elided subject gets restored
// afterward). Most "and"-joined text will still NOT split - e.g. "Nigeria
// and Ghana signed a trade deal" keeps "Nigeria and Ghana" as one subject,
// because only the right side of the full sentence contains a verb at all.
// Under-splitting is the safe default, mirroring "false merging is worse
// than under-resolution" one level down.
// ---------------------------------------------------------------------------

const SPLIT_CONJUNCTIONS = /\s+and\s+|;\s+/gi;

function findCandidateSplits(text: string): number[] {
  const positions: number[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(SPLIT_CONJUNCTIONS);
  while ((match = pattern.exec(text)) !== null) {
    positions.push(match.index);
  }
  return positions;
}

// Deliberately looser than extractSVO's full-resolution check: this only
// asks "is there a recognizable assertion verb here at all," not "does this
// segment have its own explicit subject." That's necessary because the most
// common compound pattern - "X did A and did B" - elides the shared subject
// from the second clause entirely ("The government approved the project and
// allocated 50 billion naira" has no subject before "allocated"). Requiring
// an explicit subject on both sides would silently refuse to split exactly
// the compound claims this phase exists to decompose.
function hasRecognizableVerb(text: string): boolean {
  return SVO_VERB_PATTERN.test(text);
}

// Explicit enumerated lists ("... three points: one, moisturize the skin,
// two, avoid alcohol, ... and 4, use footwear") - found via Sprint 5.5's
// diagnostic on a real post that was extracted as a single, undecomposed
// component despite explicitly numbering four separate claims. Narrowly
// scoped, unlike the "and"/";" splitter above: word-ordinal markers
// ("one,", "two,", ...) are a strong, deliberate enumeration signal rare
// enough in ordinary prose that hasRecognizableVerb is NOT required on each
// resulting segment (list items are frequently imperative fragments with
// no subject of their own - "moisturize the skin" has no SVO-recognized
// verb, but is still clearly one item of the list). Requires at least 2
// word-ordinal markers before triggering at all, specifically to avoid
// misreading an ordinary numeric list ("scores were 10, 20, and 30
// points") as enumeration - bare digit markers ("4,") are only recognized
// as continuations AFTER a word-ordinal anchor has already been found.
const ORDINAL_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const WORD_ORDINAL_MARKER = new RegExp(`\\b(?:${ORDINAL_WORDS.join("|")})\\s*,`, "gi");
const DIGIT_ORDINAL_MARKER = /\b\d{1,2}\s*,/g;

function findEnumeratedMarkers(text: string): TextSpan[] {
  const wordMarkers: TextSpan[] = [];
  let match: RegExpExecArray | null;
  const wordPattern = new RegExp(WORD_ORDINAL_MARKER);
  while ((match = wordPattern.exec(text)) !== null) {
    wordMarkers.push({ start: match.index, end: match.index + match[0].length });
  }
  if (wordMarkers.length < 2) return [];

  const lastWordMarkerEnd = wordMarkers[wordMarkers.length - 1].end;
  const digitMarkers: TextSpan[] = [];
  const digitPattern = new RegExp(DIGIT_ORDINAL_MARKER);
  while ((match = digitPattern.exec(text)) !== null) {
    if (match.index >= lastWordMarkerEnd) {
      digitMarkers.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  return [...wordMarkers, ...digitMarkers].sort((a, b) => a.start - b.start);
}

function splitOnEnumeratedMarkers(text: string): TextSpan[] | null {
  const markers = findEnumeratedMarkers(text);
  if (markers.length < 2) return null;

  // Segment 0 runs up to the first marker (the un-numbered intro clause,
  // e.g. "there are three points to avoid complications,"). Every later
  // segment starts AFTER its own marker token ("one,"/"two,"/"4,") is
  // stripped, matching the existing convention of excluding "and"/";" from
  // the right-hand side in the conjunction splitter above.
  const rawBounds: TextSpan[] = [{ start: 0, end: markers[0].start }];
  for (let i = 0; i < markers.length; i += 1) {
    const segStart = markers[i].end;
    const segEnd = i + 1 < markers.length ? markers[i + 1].start : text.length;
    rawBounds.push({ start: segStart, end: segEnd });
  }

  const segments: TextSpan[] = [];
  for (const { start, end } of rawBounds) {
    if (start >= end) continue;
    const raw = text.slice(start, end);
    const leadingWhitespace = raw.length - raw.trimStart().length;
    // A dangling "and" immediately before the next marker (e.g. "...also
    // avoid walking barefoot, and" right before "4,") belongs to the next
    // item's introduction, not this segment's content - trimmed the same
    // way the leading "and"/";" is trimmed by the conjunction splitter.
    const withoutTrailingAnd = raw.replace(/,?\s+and\s*$/i, "");
    const trimmedLength = withoutTrailingAnd.trimEnd().length;
    if (trimmedLength - leadingWhitespace <= 0) continue;
    const segmentText = withoutTrailingAnd.slice(leadingWhitespace, trimmedLength);
    if (segmentText.split(/\s+/).filter(Boolean).length < 2) continue;
    segments.push({ start: start + leadingWhitespace, end: start + trimmedLength });
  }

  // Fewer than 2 usable segments means the marker positions didn't actually
  // separate distinct content (e.g. everything collapsed into one chunk
  // after filtering) - abandon the enumerated split rather than return
  // something degenerate.
  return segments.length >= 2 ? segments : null;
}

export function segmentIntoComponents(text: string): TextSpan[] {
  const enumerated = splitOnEnumeratedMarkers(text);
  if (enumerated) return enumerated;

  const candidates = findCandidateSplits(text);

  for (const splitAt of candidates) {
    const leftText = text.slice(0, splitAt).trim();
    const rightMatch = text.slice(splitAt).match(/^\s+(?:and|;)\s+(.*)$/i);
    if (!rightMatch) continue;
    const rightText = rightMatch[1].trim();

    if (leftText.split(/\s+/).length < 3 || rightText.split(/\s+/).length < 3) continue;

    if (hasRecognizableVerb(leftText) && hasRecognizableVerb(rightText)) {
      const rightStart = text.indexOf(rightText, splitAt);
      return [
        { start: 0, end: leftText.length },
        { start: rightStart, end: rightStart + rightText.length },
      ];
    }
  }

  return [{ start: 0, end: text.length }];
}

// ---------------------------------------------------------------------------
// Top-level orchestration
// ---------------------------------------------------------------------------

export function extractPropositionComponents(claimText: string): PropositionComponent[] {
  const spans = segmentIntoComponents(claimText);

  const components = spans.map((span, index) => {
    const segmentText = claimText.slice(span.start, span.end);
    const svo = extractSVO(segmentText);

    return {
      componentIndex: index,
      propositionText: segmentText,
      sourceTextSpan: span,
      subject: svo.subject,
      predicate: svo.predicate,
      object: svo.object,
      entities: extractEntities(segmentText),
      quantity: extractQuantity(segmentText),
      negation: extractNegation(segmentText),
      attribution: extractAttribution(segmentText),
      modality: extractModality(segmentText),
      conditionality: extractConditionality(segmentText),
      temporalScope: extractTemporalScope(segmentText),
      jurisdiction: extractJurisdiction(segmentText),
    };
  });

  // Compound claims commonly elide the subject on later clauses ("X did A
  // and did B" - the second clause has no subject of its own). Rather than
  // leave later components with an unresolved subject AND an incomplete-
  // reading propositionText (e.g. "allocated 50 billion naira", which is not
  // independently meaningful without knowing who), inherit the first
  // component's resolved subject into any later component whose own subject
  // is unresolved, at a discounted confidence, and rewrite propositionText
  // to read as a complete, independently-verifiable proposition. The
  // inherited subject's sourceTextSpan intentionally still points at the
  // FIRST component's span, not this one's - it is not literally present
  // in this component's own text, and that must stay traceable.
  const firstSubject = components[0]?.subject;
  if (firstSubject && firstSubject.method !== "unresolved" && firstSubject.value) {
    for (let i = 1; i < components.length; i += 1) {
      const component = components[i];
      if (component.subject.method === "unresolved") {
        component.subject = {
          value: firstSubject.value,
          confidence: firstSubject.confidence * 0.8,
          method: "deterministic",
          sourceTextSpan: firstSubject.sourceTextSpan,
        };
        component.propositionText = `${firstSubject.value} ${component.propositionText}`;
      }
    }
  }

  return components;
}
