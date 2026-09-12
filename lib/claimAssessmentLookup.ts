// lib/claimAssessmentLookup.ts
//
// The one authoritative "current assessment" lookup for a Claim, extracted
// out of app/api/claims/[id]/route.ts (P3.1) so both that route and the new
// Claim page's generateMetadata (P3.2) share a single implementation of this
// rule rather than two independently-written copies that could drift:
//
//   claim.currentAssessmentVersion is the authority - never "most recently
//   created" (sort by createdAt), and a missing row is never silently
//   substituted with an older version.
//
// Requires DB access, so this stays separate from lib/claimPresentation.ts
// (which is deliberately pure/presentation-only, no models imported).
import Claim from "@/models/Claim";
import TrustAssessment from "@/models/TrustAssessment";

export async function getAuthoritativeClaimAssessment(claimId: string) {
  const claim = await Claim.findById(claimId);
  if (!claim) {
    return { claim: null, currentAssessment: null };
  }

  const currentAssessment = await TrustAssessment.findOne({
    claim: claim._id,
    claimAssessmentVersion: claim.currentAssessmentVersion,
  });

  return { claim, currentAssessment };
}
