export type ShareStatus = "shared" | "copied" | "cancelled" | "error";

export type ShareResult = {
  status: ShareStatus;
  message: string;
};

export function buildPostShareUrl(postId: string): string {
  return `${window.location.origin}/posts/${postId}`;
}

export function buildClaimShareUrl(claimId: string): string {
  return `${window.location.origin}/claims/${claimId}`;
}

// Deterministic, non-editorial - never generated, never includes trust
// reasoning. Bounded so an unusually long claim can't produce unwieldy
// share text.
const CLAIM_SHARE_TEXT_MAX_LENGTH = 120;

export function buildClaimShareText(claimText?: string | null): string {
  if (!claimText?.trim()) {
    // P3.2: canonicalText is deliberately not fetched per-card in Feed/
    // profile-compact contexts (would require a new per-post Claim lookup
    // for share-copy wording alone) - a concise generic line is used
    // instead. The Claim URL itself carries the real information.
    return "See the current assessment of this claim on VeriVerse.";
  }

  const trimmed = claimText.trim();
  const truncated =
    trimmed.length > CLAIM_SHARE_TEXT_MAX_LENGTH
      ? `${trimmed.slice(0, CLAIM_SHARE_TEXT_MAX_LENGTH).trimEnd()}…`
      : trimmed;

  return `See the current VeriVerse assessment of this claim: "${truncated}"`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

// Client-side only. Attempts native Web Share, falling back to a clipboard
// copy of the same canonical URL when native share is unavailable or fails
// for a reason other than the user cancelling. Shared by sharePost() and
// shareClaim() - same interaction model, different URL/copy.
async function shareUrl(params: { url: string; title: string; text: string }): Promise<ShareResult> {
  const { url, title, text } = params;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  if (canNativeShare) {
    try {
      await navigator.share({ title, text, url });
      return { status: "shared", message: "Shared" };
    } catch (error: unknown) {
      if (isAbortError(error)) {
        // User cancelled the native share sheet - not an error, and not a
        // reason to fall back to clipboard.
        return { status: "cancelled", message: "" };
      }

      const copied = await copyTextToClipboard(url);
      return copied
        ? { status: "copied", message: "Link copied" }
        : { status: "error", message: "Could not share or copy the link" };
    }
  }

  const copied = await copyTextToClipboard(url);
  return copied
    ? { status: "copied", message: "Link copied" }
    : { status: "error", message: "Could not copy the link" };
}

export async function sharePost(params: {
  postId: string;
  title: string;
  text: string;
}): Promise<ShareResult> {
  return shareUrl({ url: buildPostShareUrl(params.postId), title: params.title, text: params.text });
}

// P3.2: a separate, explicit action from sharePost() - Post Share stays
// Post Share (author, wording, comments preserved); this shares the
// canonical Claim page instead (current assessment, consolidated evidence).
// Never invoked automatically in place of sharePost().
export async function shareClaim(params: {
  claimId: string;
  claimText?: string | null;
}): Promise<ShareResult> {
  return shareUrl({
    url: buildClaimShareUrl(params.claimId),
    title: "VeriVerse claim assessment",
    text: buildClaimShareText(params.claimText),
  });
}
