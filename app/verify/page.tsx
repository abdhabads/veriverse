"use client";

// app/verify/page.tsx
//
// P5.1: the first external-VeriVerse surface - "paste text, find out what
// VeriVerse knows." Deliberately public/anonymous-reachable (like the
// Claim/Post detail pages) since a plain lookup is safe and cheap; only
// the "Verify" action itself may come back asking the visitor to sign in,
// exactly mirroring what POST /api/verify already decided server-side -
// this page never makes its own auth decision, it only renders the one
// the API already made.
//
// Deliberately does NOT render assessment/evidence/explanation itself -
// once a Claim has an available assessment, this redirects to the
// existing, already-complete /claims/[id] page rather than duplicating
// any part of that experience here (see app/claims/[id]/ClaimPageClient.tsx).
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageWrapper from "@/components/PageWrapper";
import Toast from "@/components/Toast";
import { api, getErrorMessage } from "@/lib/apiClient";

const MAX_TEXT_LENGTH = 1000;

type VerifyResult = {
  contentType: "claim" | "question" | "instruction" | "rhetorical_claim";
  extractedClaim: string | null;
  claimId: string | null;
  resolution: "existing" | "new" | "no_claim_found";
  assessmentStatus: "available" | "assessment_not_available";
  canonicalClaimUrl: string | null;
  verificationRequired: boolean;
};

export default function VerifyPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);

  async function handleVerify() {
    const trimmed = text.trim();
    if (!trimmed) return;

    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const res = await api.post("/verify", { text: trimmed });
      const payload: VerifyResult = res.data;

      if (payload.assessmentStatus === "available" && payload.claimId) {
        router.push(`/claims/${payload.claimId}`);
        return;
      }

      setResult(payload);
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to verify this text. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageWrapper
      title="Verify"
      subtitle="Paste a factual claim to see what VeriVerse already knows, or request a new verification."
    >
      {message && <Toast message={message} type="error" />}

      <div className="vv-card p-5 mb-6">
        <label htmlFor="verify-text" className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-veriverse-dark/60">
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
        <button
          type="button"
          onClick={handleVerify}
          disabled={loading || !text.trim()}
          className="vv-btn-primary"
        >
          {loading ? "Checking..." : "Verify"}
        </button>
      </div>

      {result?.resolution === "no_claim_found" && (
        <div className="vv-card p-5" data-testid="verify-no-claim">
          <h3 className="vv-section-title mb-2">No verifiable claim identified</h3>
          <p className="text-sm leading-6 text-veriverse-dark/70">
            This reads as a question or instruction rather than a factual claim. Try rephrasing it
            as a statement to get a verification check.
          </p>
        </div>
      )}

      {result?.verificationRequired && (
        <div className="vv-card p-5" data-testid="verify-sign-in-required">
          <h3 className="vv-section-title mb-2">Sign in to verify this claim</h3>
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
