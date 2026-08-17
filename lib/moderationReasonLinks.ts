type ModerationReasonSource = {
  title?: string;
  url: string;
  domain?: string;
  stance?: "supports" | "contradicts" | "context" | "unknown";
};

export type ParsedModerationSourceReason = {
  label: string;
  url: string;
  stance: "supports" | "contradicts" | "context" | "unknown";
};

const SOURCE_REASON_PREFIX = "fact_check_source::";

function decodeReasonPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeStance(
  value: string
): ParsedModerationSourceReason["stance"] {
  if (
    value === "supports" ||
    value === "contradicts" ||
    value === "context" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

function getSourceLabel(source: ModerationReasonSource): string {
  return source.title?.trim() || source.domain?.trim() || "Fact-check source";
}

export function createModerationSourceReason(
  source: ModerationReasonSource
): string | null {
  const url = source.url.trim();

  if (!url) {
    return null;
  }

  return [
    SOURCE_REASON_PREFIX,
    encodeURIComponent(normalizeStance(source.stance || "unknown")),
    "|",
    encodeURIComponent(getSourceLabel(source)),
    "|",
    encodeURIComponent(url),
  ].join("");
}

export function parseModerationSourceReason(
  reason: string
): ParsedModerationSourceReason | null {
  if (!reason.startsWith(SOURCE_REASON_PREFIX)) {
    return null;
  }

  const payload = reason.slice(SOURCE_REASON_PREFIX.length);
  const [stancePart, labelPart, urlPart] = payload.split("|");

  if (!stancePart || !labelPart || !urlPart) {
    return null;
  }

  const url = decodeReasonPart(urlPart).trim();

  if (!url) {
    return null;
  }

  return {
    stance: normalizeStance(decodeReasonPart(stancePart)),
    label: decodeReasonPart(labelPart).trim() || "Fact-check source",
    url,
  };
}

export function splitModerationReasons(reasons: string[] = []) {
  const textReasons: string[] = [];
  const sourceReasons: ParsedModerationSourceReason[] = [];
  const seenSources = new Set<string>();

  for (const reason of reasons) {
    const parsedSourceReason = parseModerationSourceReason(reason);

    if (!parsedSourceReason) {
      textReasons.push(reason);
      continue;
    }

    if (seenSources.has(parsedSourceReason.url)) {
      continue;
    }

    seenSources.add(parsedSourceReason.url);
    sourceReasons.push(parsedSourceReason);
  }

  return {
    textReasons,
    sourceReasons,
  };
}