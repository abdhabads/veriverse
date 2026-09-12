import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import TrustAssessment from "@/models/TrustAssessment";
import EvidenceObject from "@/models/EvidenceObject";
import Post from "@/models/Post";
import User from "@/models/User";
import UserRelation from "@/models/UserRelation";
import ClaimFollow from "@/models/ClaimFollow";
import { getUserIdFromRequest } from "@/lib/auth";
import { isValidObjectId } from "@/lib/validation";
import { fail } from "@/lib/apiResponse";
import { getAuthoritativeClaimAssessment } from "@/lib/claimAssessmentLookup";
import {
  getClaimAssessmentPresentation,
  getClaimSummarySentence,
  boundEvidenceBuckets,
} from "@/lib/claimPresentation";

// Mirrors the exact unavailable-account semantics already enforced by
// Search/Topics (app/api/search/route.ts, app/api/topics/[tag]/route.ts).
const now = () => new Date();
function unavailableUserFilter() {
  return {
    $or: [
      { isDeactivated: true },
      { moderationStatus: "banned" },
      { moderationStatus: "suspended", suspendedUntil: { $gt: now() } },
    ],
  };
}

const MAX_EVIDENCE_TOTAL = 20;
const MAX_HISTORY = 10;
const MAX_RELATED_POSTS = 10;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PublicEvidence = {
  sourceUrl: string;
  domain: string;
  publisher: string;
  sourceType: string;
  publishedAt: Date | null;
  stance: "supports" | "contradicts" | "context" | "unknown";
  evidenceText: string | null;
};

export async function GET(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const { id } = await context.params;

    if (!isValidObjectId(id)) {
      return fail("Invalid claim ID", 400);
    }

    // Authoritative current-assessment lookup (shared with generateMetadata,
    // see lib/claimAssessmentLookup.ts): the exact version the Claim itself
    // points to, never "most recently created". A missing row here (claim
    // created but its TrustAssessment hasn't been written yet, or stale/
    // malformed historical state) must never be papered over by silently
    // substituting an older version as if it were current.
    const { claim, currentAssessment } = await getAuthoritativeClaimAssessment(id);
    if (!claim) {
      return fail("Claim not found", 404);
    }

    let currentAssessmentPayload: Record<string, unknown> | null = null;
    let evidencePayload: { supporting: PublicEvidence[]; contradicting: PublicEvidence[]; context: PublicEvidence[] } = {
      supporting: [],
      contradicting: [],
      context: [],
    };

    if (currentAssessment) {
      // Current evidence comes exclusively from the IDs this specific
      // TrustAssessment row references - never EvidenceObject.find({claimId})
      // directly, which would mix every historical version's evidence
      // together with the current one.
      const supportingIds = (currentAssessment.supportingEvidenceIds || [])
        .slice(0, MAX_EVIDENCE_TOTAL)
        .map(String);
      const contradictingIds = (currentAssessment.contradictingEvidenceIds || [])
        .slice(0, MAX_EVIDENCE_TOTAL)
        .map(String);
      const unresolvedIds = (currentAssessment.unresolvedEvidenceIds || [])
        .slice(0, MAX_EVIDENCE_TOTAL)
        .map(String);

      const evidenceDocs = await EvidenceObject.find({
        _id: { $in: [...supportingIds, ...contradictingIds, ...unresolvedIds] },
      }).select("sourceUrl domain publisher sourceType publishedAt stance evidenceText");

      const byId = new Map(evidenceDocs.map((doc: any) => [String(doc._id), doc]));

      const toPublicEvidence = (docId: string): PublicEvidence | null => {
        const doc = byId.get(docId);
        if (!doc) return null;
        return {
          sourceUrl: doc.sourceUrl,
          domain: doc.domain || "",
          publisher: doc.publisher || "",
          sourceType: doc.sourceType,
          publishedAt: doc.publishedAt || null,
          stance: doc.stance,
          evidenceText: doc.evidenceText || null,
        };
      };

      const isPublicEvidence = (item: PublicEvidence | null): item is PublicEvidence => item !== null;
      const rawBuckets = {
        supporting: supportingIds.map(toPublicEvidence).filter(isPublicEvidence),
        contradicting: contradictingIds.map(toPublicEvidence).filter(isPublicEvidence),
        context: unresolvedIds.map(toPublicEvidence).filter(isPublicEvidence),
      };

      evidencePayload = boundEvidenceBuckets(rawBuckets, MAX_EVIDENCE_TOTAL);

      const verdict = getClaimAssessmentPresentation(currentAssessment.assessmentBand);
      const supportingCount = evidencePayload.supporting.length;
      const contradictingCount = evidencePayload.contradicting.length;
      const contextCount = evidencePayload.context.length;

      currentAssessmentPayload = {
        assessedAt: currentAssessment.createdAt,
        verdict,
        confidenceLevel: currentAssessment.verificationConfidence?.level || "low",
        evidenceSummary: { supportingCount, contradictingCount, contextCount },
        summary: getClaimSummarySentence(currentAssessment.assessmentBand, {
          supportingCount,
          contradictingCount,
          contextCount,
        }),
      };
    }

    // History: strictly prior assessments, queried directly by version
    // rather than fetching "current" and filtering it out client-side -
    // this can never accidentally include the current row.
    const historyRows = await TrustAssessment.find({
      claim: claim._id,
      claimAssessmentVersion: { $lt: claim.currentAssessmentVersion },
    })
      .sort({ claimAssessmentVersion: -1 })
      .limit(MAX_HISTORY)
      .select("createdAt assessmentBand verificationConfidence supportingEvidenceIds contradictingEvidenceIds");

    const history = historyRows.map((row: any) => ({
      assessedAt: row.createdAt,
      verdict: getClaimAssessmentPresentation(row.assessmentBand),
      confidenceLevel: row.verificationConfidence?.level || "low",
      supportingCount: (row.supportingEvidenceIds || []).length,
      contradictingCount: (row.contradictingEvidenceIds || []).length,
    }));

    // Related posts: same anonymous-safe block/mute + moderation-unavailable
    // exclusion convention already proven by Search/Topics.
    const requesterId = getUserIdFromRequest(req);
    let excludedAuthorIds: string[] = [];
    if (requesterId) {
      const relations = await UserRelation.find({
        sourceUser: requesterId,
        relationType: { $in: ["block", "mute"] },
      }).select("targetUser");
      excludedAuthorIds = relations.map((item: any) => String(item.targetUser));
    }
    const moderationExcluded = await User.find(unavailableUserFilter()).select("_id");
    const authorExclusions = [
      ...excludedAuthorIds,
      ...moderationExcluded.map((item: any) => String(item._id)),
    ];

    const relatedPosts = await Post.find({
      claimId: claim._id,
      ...(authorExclusions.length > 0 ? { author: { $nin: authorExclusions } } : {}),
    })
      .select(
        "content author createdAt status expertDecision verificationScore contradictionCount " +
          "groundingSources groundingStatus supportCount contentType likesCount accurateVotes " +
          "inaccurateVotes repostsCount finalized"
      )
      .populate("author", "username reputation avatarUrl badges")
      .sort({ createdAt: -1 })
      .limit(MAX_RELATED_POSTS);

    // P3.3: additive follow state. isFollowing is always a concrete boolean
    // (never null) - a logged-out visitor is definitionally not following
    // anything. followerCount is public regardless of auth state. Both are
    // flat-cost, indexed lookups independent of everything else above.
    const [isFollowing, followerCount] = await Promise.all([
      requesterId
        ? ClaimFollow.exists({ user: requesterId, claim: claim._id }).then(Boolean)
        : Promise.resolve(false),
      ClaimFollow.countDocuments({ claim: claim._id }),
    ]);

    return NextResponse.json(
      {
        success: true,
        claim: {
          id: String(claim._id),
          canonicalText: claim.canonicalText,
          claimType: claim.claimType,
          domain: claim.domain,
          jurisdiction: claim.jurisdiction,
          temporalScope: claim.temporalScope,
          firstSeenAt: claim.firstSeenAt,
          lastEvaluatedAt: claim.lastEvaluatedAt,
        },
        assessmentStatus: currentAssessmentPayload ? "available" : "assessment_not_available",
        currentAssessment: currentAssessmentPayload,
        evidence: evidencePayload,
        history,
        relatedPosts,
        follow: { isFollowing, followerCount },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return fail("Failed to fetch claim", 500);
  }
}
