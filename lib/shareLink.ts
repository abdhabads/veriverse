export type ShareStatus = "shared" | "copied" | "cancelled" | "error";

export type ShareResult = {
  status: ShareStatus;
  message: string;
};

export function buildPostShareUrl(postId: string): string {
  return `${window.location.origin}/posts/${postId}`;
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
// for a reason other than the user cancelling.
export async function sharePost(params: {
  postId: string;
  title: string;
  text: string;
}): Promise<ShareResult> {
  const url = buildPostShareUrl(params.postId);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  if (canNativeShare) {
    try {
      await navigator.share({ title: params.title, text: params.text, url });
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
