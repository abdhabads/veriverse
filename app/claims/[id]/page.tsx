import type { Metadata } from "next";
import { connectDB } from "@/lib/mongodb";
import { isValidObjectId } from "@/lib/validation";
import { getAuthoritativeClaimAssessment } from "@/lib/claimAssessmentLookup";
import { getClaimSummarySentence } from "@/lib/claimPresentation";
import { buildCanonicalUrl } from "@/lib/siteConfig";
import ClaimPageClient from "./ClaimPageClient";

const TITLE_TRUNCATE_LENGTH = 70;

// Deterministic, word-boundary-aware truncation - never cuts mid-word where
// avoidable, and never fabricates content beyond what canonicalText says.
function truncateForTitle(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated}…`;
}

// Metadata field groups (title/description, openGraph, twitter) each merge
// independently against the root layout's defaults - setting only the
// top-level title/description here would leave openGraph/twitter silently
// inheriting the root layout's generic "VeriVerse" values instead of this
// fallback's own text. Every branch below returns the full shape so no
// field group is left half-overridden.
function buildFallbackMetadata(canonicalUrl?: string): Metadata {
  const title = "Claim | VeriVerse";
  const description = "This claim could not be found.";
  return {
    title,
    description,
    ...(canonicalUrl ? { alternates: { canonical: canonicalUrl } } : {}),
    openGraph: { title, description, type: "article", ...(canonicalUrl ? { url: canonicalUrl } : {}) },
    twitter: { card: "summary", title, description },
  };
}

type RouteParams = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!isValidObjectId(id)) {
    return buildFallbackMetadata();
  }

  const canonicalUrl = buildCanonicalUrl(`/claims/${id}`);

  try {
    await connectDB();
    const { claim, currentAssessment } = await getAuthoritativeClaimAssessment(id);
    if (!claim) {
      return buildFallbackMetadata(canonicalUrl);
    }

    const title = `${truncateForTitle(claim.canonicalText, TITLE_TRUNCATE_LENGTH)} | VeriVerse`;
    const description = currentAssessment
      ? getClaimSummarySentence(currentAssessment.assessmentBand, {
          supportingCount: (currentAssessment.supportingEvidenceIds || []).length,
          contradictingCount: (currentAssessment.contradictingEvidenceIds || []).length,
          contextCount: (currentAssessment.unresolvedEvidenceIds || []).length,
        })
      : "VeriVerse is currently assessing this claim.";

    return {
      title,
      description,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        title,
        description,
        url: canonicalUrl,
        type: "article",
      },
      twitter: {
        card: "summary",
        title,
        description,
      },
    };
  } catch {
    // Malformed/unexpected DB state must never surface as an uncaught error
    // from metadata generation - fall back to generic, non-sensitive metadata.
    return buildFallbackMetadata(canonicalUrl);
  }
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { id } = await params;
  return <ClaimPageClient id={id} />;
}
