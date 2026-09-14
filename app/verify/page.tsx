"use client";

// app/verify/page.tsx
//
// P5.1/P5.2/P5.3: the external-VeriVerse surface - "paste text or a webpage
// URL, find out what VeriVerse knows," now also reachable by sharing
// content INTO VeriVerse (the OS/browser share sheet, via app/manifest.ts's
// share_target, or any hand-built deep link using
// lib/shareToVeriVerseLink.ts). Deliberately public/anonymous-reachable
// (like the Claim/Post detail pages) since a plain lookup is safe and
// cheap; only the "Verify" action itself may come back asking the visitor
// to sign in, exactly mirroring what POST /api/verify already decided
// server-side - this page never makes its own auth decision, it only
// renders the one the API already made.
//
// P5.3's one hard rule: arriving here via a share/deep link only ever
// PRE-FILLS this page's own state. It never fetches the URL, never calls
// the classifier, never resolves/creates a Claim, and never creates a Post
// merely because content arrived - handleVerify() is the only path to any
// of that, and it is only ever invoked by the user's own button press.
//
// Deliberately does NOT render assessment/evidence/explanation itself -
// once a Claim has an available assessment, this redirects to the
// existing, already-complete /claims/[id] page rather than duplicating
// any part of that experience here (see app/claims/[id]/ClaimPageClient.tsx).
//
// URL mode never certifies the whole page or its publisher - VeriVerse
// only identifies one primary factual claim from the page and checks it
// the same way a pasted sentence would be checked.
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PageWrapper from "@/components/PageWrapper";
import Toast from "@/components/Toast";
import { api, getErrorMessage } from "@/lib/apiClient";
import {
  MAX_SHARE_TEXT_LENGTH as MAX_TEXT_LENGTH,
  MAX_SHARE_URL_LENGTH,
  MAX_SHARE_TITLE_LENGTH,
} from "@/lib/shareToVeriVerseLink";

type VerifyMode = "text" | "url";

type VerifyResult = {
  contentType: "claim" | "question" | "instruction" | "rhetorical_claim";
  extractedClaim: string | null;
  claimId: string | null;
  resolution: "existing" | "new" | "no_claim_found";
  assessmentStatus: "available" | "assessment_not_available";
  canonicalClaimUrl: string | null;
  verificationRequired: boolean;
  // URL mode only.
  submittedUrl?: string;
  finalUrl?: string;
  pageTitle?: string | null;
};

// Incoming query-param values are untrusted external input (a share sheet,
// or anyone's hand-built link) - bounded here before they ever reach React
// state, mirroring the same limits lib/shareToVeriVerseLink.ts uses to
// build such a link in the first place. Never rendered as HTML - every use
// below is plain JSX text content, which React already escapes; nothing
// here uses dangerouslySetInnerHTML.
function clampParam(value: string | null, maxLength: number): string {
  if (!value) return "";
  return value.trim().slice(0, maxLength);
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyPageInner />
    </Suspense>
  );
}

function VerifyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<VerifyMode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [sharedTitle, setSharedTitle] = useState("");
  const [cameFromShare, setCameFromShare] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);

  // Pre-fills state only - never calls handleVerify. Runs once per set of
  // incoming params; editing the fields afterward is ordinary local state,
  // untouched by this effect running again with the same params.
  useEffect(() => {
    const incomingText = clampParam(searchParams.get("text"), MAX_TEXT_LENGTH);
    const incomingUrl = clampParam(searchParams.get("url"), MAX_SHARE_URL_LENGTH);
    const incomingTitle = clampParam(searchParams.get("title"), MAX_SHARE_TITLE_LENGTH);

    if (!incomingText && !incomingUrl && !incomingTitle) return;

    setCameFromShare(true);
    if (incomingTitle) setSharedTitle(incomingTitle);
    if (incomingUrl) setUrl(incomingUrl);

    // Text takes initial-mode precedence when both arrived - the URL is
    // still retained above so switching to URL mode keeps it, but a
    // meaningful shared/selected text snippet is what the user most likely
    // means to verify first (see lib/shareToVeriVerseLink.ts's own
    // precedence comment).
    if (incomingText) {
      setText(incomingText);
      setMode("text");
    } else if (incomingUrl) {
      setMode("url");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function switchMode(next: VerifyMode) {
    setMode(next);
    setMessage("");
    setResult(null);
  }

  async function handleVerify() {
    const trimmedText = text.trim();
    const trimmedUrl = url.trim();
    if (mode === "text" && !trimmedText) return;
    if (mode === "url" && !trimmedUrl) return;

    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const res = await api.post(
        "/verify",
        mode === "text" ? { text: trimmedText } : { url: trimmedUrl }
      );
      const payload: VerifyResult = res.data;

      if (payload.assessmentStatus === "available" && payload.claimId) {
        router.push(`/claims/${payload.claimId}`);
        return;
      }

      setResult(payload);
    } catch (error: unknown) {
      const fallback =
        mode === "text"
          ? "Failed to verify this text. Please try again."
          : "Failed to verify this URL. Please try again.";
      setMessage(getErrorMessage(error, fallback));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageWrapper
      title="Verify"
      subtitle="VeriVerse will identify a primary factual claim from your text or a webpage and check whether it already has an evidence-based assessment."
    >
      {message && <Toast message={message} type="error" />}

      {cameFromShare && (
        <div className="vv-card p-4 mb-4" data-testid="verify-shared-banner">
          <p className="text-sm font-semibold text-veriverse-dark">Shared with VeriVerse</p>
          <p className="text-sm text-veriverse-dark/70">
            Review the content below, then choose Verify when you&rsquo;re ready.
          </p>
          {sharedTitle && (
            <p className="mt-1 text-xs text-veriverse-dark/50">Shared from: {sharedTitle}</p>
          )}
        </div>
      )}

      <div className="vv-card p-5 mb-6">
        <div className="vv-action-row mb-4" role="tablist" aria-label="Verify mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "text"}
            onClick={() => switchMode("text")}
            className={mode === "text" ? "vv-btn-primary" : "vv-btn-secondary"}
          >
            Text
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "url"}
            onClick={() => switchMode("url")}
            className={mode === "url" ? "vv-btn-primary" : "vv-btn-secondary"}
          >
            URL
          </button>
        </div>

        {mode === "text" ? (
          <>
            <label
              htmlFor="verify-text"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-veriverse-dark/60"
            >
              Text to verify
            </label>
            <textarea
              id="verify-text"
              className="vv-textarea mb-2"
              rows={4}
              maxLength={MAX_TEXT_LENGTH}
              placeholder="e.g. The Bank of England has cut interest rates to 3%."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <p className="mb-4 text-xs text-veriverse-dark/50">
              For best results, submit one factual claim at a time. ({text.length}/{MAX_TEXT_LENGTH})
            </p>
          </>
        ) : (
          <>
            <label
              htmlFor="verify-url"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-veriverse-dark/60"
            >
              Webpage URL to verify
            </label>
            <input
              id="verify-url"
              type="url"
              className="vv-input mb-2"
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="mb-4 text-xs text-veriverse-dark/50">
              VeriVerse will identify one primary factual claim from the page - not every claim it
              makes, and not a judgment of the page or its publisher.
            </p>
          </>
        )}

        <button
          type="button"
          onClick={handleVerify}
          disabled={loading || (mode === "text" ? !text.trim() : !url.trim())}
          className="vv-btn-primary"
        >
          {loading ? (mode === "text" ? "Checking..." : "Fetching page...") : "Verify"}
        </button>
      </div>

      {result?.resolution === "no_claim_found" && (
        <div className="vv-card p-5" data-testid="verify-no-claim">
          <h3 className="vv-section-title mb-2">No verifiable claim identified</h3>
          <p className="text-sm leading-6 text-veriverse-dark/70">
            {mode === "url"
              ? "VeriVerse could not identify a factual claim on that page."
              : "This reads as a question or instruction rather than a factual claim. Try rephrasing it as a statement to get a verification check."}
          </p>
        </div>
      )}

      {result?.verificationRequired && (
        <div className="vv-card p-5" data-testid="verify-sign-in-required">
          <h3 className="vv-section-title mb-2">Sign in to verify this claim</h3>
          {result.pageTitle && (
            <p className="mb-2 text-xs text-veriverse-dark/50">From: {result.pageTitle}</p>
          )}
          <p className="mb-3 text-sm leading-6 text-veriverse-dark/70">
            {result.claimId
              ? "VeriVerse has this claim on record but hasn't verified it yet."
              : "This looks like a new claim VeriVerse hasn't checked yet."}{" "}
            Verifying a claim for the first time requires an active account.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/login" className="vv-btn-primary">
              Sign in
            </Link>
            {result.claimId && (
              <Link href={`/claims/${result.claimId}`} className="vv-btn-secondary">
                View claim
              </Link>
            )}
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
