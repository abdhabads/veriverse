import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

import Post from "../models/Post";
import Claim from "../models/Claim";
import EvidenceObject from "../models/EvidenceObject";
import TrustAssessment from "../models/TrustAssessment";
import HistoricalClaimBackfillCheckpoint from "../models/HistoricalClaimBackfillCheckpoint";
import { computeClaimIdentity } from "../lib/claimNormalization";
import {
  findOrCreateClaim,
  getExistingEvidenceForClaim,
  advanceClaimAssessmentVersion,
  touchClaimLastEvaluatedAt,
  EvidenceForClaim,
} from "../lib/claimIdentity";
import { runGroundedFactCheck } from "../lib/groundedFactCheck";
import { runTavilyGrounding } from "../lib/tavilyGrounding";
import { persistEvidenceObjects } from "../lib/evidencePersistence";
import { assessEvidenceStrength, EvidenceItemLike } from "../lib/evidenceScoring";
import {
  computeTrustAssessment,
  buildAndPersistTrustAssessment,
  TRUST_ASSESSMENT_MODEL_VERSION,
} from "../lib/trustAssessment";
import { screenContentWithAI, ContentType } from "../lib/aiModeration";
import { resolveGroundingPlan } from "../lib/contentTypeRouting";
import { withRetry, withTimeout } from "../lib/withRetry";
import { hashContent } from "../lib/hash";

// TRUTH_PIPELINE_CACHE_VERSION is not exported from lib/aiTruthPipeline.ts
// (that module is the live route's own entry point, deliberately not
// imported here - this backfill only reuses the smaller primitives beneath
// it). The version number itself is a plain constant, not logic - pinned
// here to match production's cache-key shape for reference/reporting only.
// This script never reads or writes GroundingCache (its TTL makes it
// unusable as durable state; the checkpoint model is authoritative).
const TRUTH_PIPELINE_CACHE_VERSION = "15";

// ---------------------------------------------------------------------------
// The fixed, closed set of posts this script will EVER touch. Deliberately
// hardcoded - never derived from a "find posts with claimId: null" query, so
// it can never later sweep up an unrelated post. storedContentType reflects
// exactly what's already persisted on the Post document today; null means no
// stored classification exists and this post requires live reclassification
// (and is therefore always needs_manual_review - see classifyStage).
// ---------------------------------------------------------------------------
type HistoricalPostSeed = {
  postId: string;
  content: string;
  storedContentType: "claim" | "question" | "instruction" | null;
};

export const HISTORICAL_POSTS: HistoricalPostSeed[] = [
  { postId: "6a87b402690832f97d78ecd8", content: "Tinubu is the current president of Nigeria", storedContentType: null },
  { postId: "6a880ea20110baab6cdd5bb7", content: "peter obi is the current president of nigeria", storedContentType: null },
  { postId: "6a88627cb7d2df869ac4080d", content: "social media has influenced political participation among Nigerian youths", storedContentType: null },
  { postId: "6a889ea8ec874c5411441356", content: "Most of the times, long lasting friendships that lead to people trusting and supporting one another forever are those built within an academic setting amongst young people striving to become great men", storedContentType: null },
  { postId: "6a898516b39529fc99d13b3e", content: "Canada is set to impose equivalent tariffs on the United States. #politics", storedContentType: null },
  { postId: "6a89d59ad0a467c2fc1adb47", content: "Chevening offers fully funded scholarships for eligible international students to pursue a one year master’s degree in the UK. It is a highly competitive scholarship programme.#truth", storedContentType: null },
  { postId: "6a89d99a53aa13ab00c0bd3c", content: "Mathematics in Nigeria is taught more for solving questions than for solving real life problems#truth", storedContentType: null },
  { postId: "6a89de0b0d4f9e4b0eb12c24", content: "#ideologyandPoliticsinNigeria'sdemocracy", storedContentType: null },
  { postId: "6a8bf58df08fa9c44c0cbc7c", content: "My name is Aliyu Shuaibu Muhammad PhD, faculty member at Yusuf Maitama Sule Federal University of Education Kano", storedContentType: null },
  { postId: "6a8c8ee5dd64d2b9afb9cb2b", content: "Vote for the right person\nA GOD fearing", storedContentType: null },
  { postId: "6a8c9a14b6e98803ad2d633e", content: "Hello My name is Mubarak Muazu Alasan, I want know is learn2Earn.ng fellowship real?", storedContentType: null },
  { postId: "6a8ebd4eee94e037f2b64dbc", content: "What’s the difference between Narrow AI and General AI.", storedContentType: null },
  { postId: "6a8ebdb8f8c1ab8399a14440", content: "Provide two real-world examples of Narrow AI that you use in your daily life.", storedContentType: null },
  { postId: "6a8f60abbf71204e557f2507", content: "Alhamdulillah for everything", storedContentType: null },
  { postId: "6a901efd338b7b05c3b81cbc", content: "The proliferation of fake news, misinformation, and unverified content on existing social media platforms has eroded public trust.", storedContentType: null },
  { postId: "6a90648f87e726ab3b73a71f", content: "Alhamdulillah for everything", storedContentType: null },
  { postId: "6a909e541c9888802499eef6", content: "Masha Allah this is welcome development", storedContentType: "claim" },
  { postId: "6a90a06469494786cd851fca", content: "This is welcome.development", storedContentType: null },
  { postId: "6a9149f9284be67c667a83fd", content: "A daily detox regimen helps eliminate accumulated toxins from the body.", storedContentType: "claim" },
  { postId: "6a91b8ff1f713246a5ae4c9a", content: "The human heart has four chambers.", storedContentType: "claim" },
  { postId: "6a91bb36a1bdea3e52226d2b", content: "Water boils at 100 degrees Celsius at sea level", storedContentType: "claim" },
  { postId: "6a91d808c849f39285f476c7", content: "Zabiri has his first Hatrick in La Liga #sport", storedContentType: "claim" },
  { postId: "6a91f9bc8867d0b70115afaf", content: "In Geometrical Optics, the Gaussian lens equation is used to determine the relationship between object distance, image distance, and focal length. how does the sign convention affect the accuracy of the result? #physics#gaussiangeometric", storedContentType: "question" },
  { postId: "6a91fe49f1e75ac199e5df35", content: "Regular eye examinations can help detect certain eye diseases, including glaucoma and diabetic retinopathy, before noticeable vision loss occurs, early detection and appropriate treatment can help reduce the risk of vision impairment.\n#eyehealth#Visionhealth", storedContentType: "claim" },
  { postId: "6a9400bd9a03dc58f200aab9", content: "Opay are going on a break starting 1st septembber", storedContentType: "claim" },
  { postId: "6a97fbbb14d4bce652198ed1", content: "I have heard a lot about lab grown meat or cultivated meat, what should consumers be concerned about:\nsource:%20Synthego", storedContentType: "question" },
  { postId: "6a9836369ce457da42ceb788", content: "Is it true that the Vikings used ointment made from duck bones, and that the ancient Greeks used pigeon bones mixed with herbs for medicinal purposes?", storedContentType: "question" },
  { postId: "6a9c7ab45c99b2efbbb30789", content: "Nigeria has 36 states and the Federal Capital Territory", storedContentType: "claim" },
  { postId: "6a9c8390b2ee5552c1cd6967", content: "Mount Everest is the tallest mountain above sea level on Earth", storedContentType: "claim" },
  { postId: "6a9c83b6b2ee5552c1cd6968", content: "The human body has 206 bones in adulthood", storedContentType: "claim" },
  { postId: "6a9c83d6b2ee5552c1cd6969", content: "The Great Wall of China is over 13,000 miles long", storedContentType: "claim" },
  { postId: "6a9dec31f41b099603f14cdd", content: "marriage means two people becoming one", storedContentType: "claim" },
];

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!process.env[key]) process.env[key] = value;
  }
}

type CliArgs = {
  apply: boolean;
  applyIds: Set<string>;
  approveManualReview: Set<string>;
};

function parseArgs(argv: string[]): CliArgs {
  const apply = argv.includes("--apply");
  const applyIdsArg = argv.find((a) => a.startsWith("--apply-ids="));
  const approveArg = argv.find((a) => a.startsWith("--approve-manual-review="));
  return {
    apply,
    applyIds: new Set((applyIdsArg?.split("=")[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
    approveManualReview: new Set((approveArg?.split("=")[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
  };
}

const STAGE_ORDER = [
  "pending",
  "classified",
  "claim_resolved",
  "evidence_completed",
  "version_reserved",
  "assessment_completed",
  "post_linked",
] as const;
type Stage = (typeof STAGE_ORDER)[number];

function stageAtLeast(current: Stage, target: Stage): boolean {
  return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(target);
}

async function getOrCreateCheckpoint(postId: string) {
  let checkpoint = await HistoricalClaimBackfillCheckpoint.findOne({ postId });
  if (!checkpoint) {
    checkpoint = await HistoricalClaimBackfillCheckpoint.create({ postId, stage: "pending" });
  }
  return checkpoint;
}

type ClassificationResult = {
  eligibility: "eligible_claim" | "skip_question" | "skip_instruction" | "needs_manual_review";
  classificationSource: "stored" | "live_reclassification";
  classifiedContentType: ContentType;
  classifiedExtractedClaim: string | null;
};

// Pure - no checkpoint, no persistence, no side effects beyond an optional
// live classifier call. Used by BOTH dry-run (result stays in memory only)
// and apply (result written to the checkpoint by classifyStage below).
// Dry-run deliberately re-pays the live-classifier cost on every run rather
// than caching anything here, so it stays a genuine zero-write operation,
// safe to repeat against production at any time.
//
// Posts with a trustworthy stored contentType keep it verbatim. Posts with
// none get a fresh classification for REPORTING purposes only - they are
// always pinned to needs_manual_review regardless of what the classifier
// returns, and cannot become eligible without a separate, explicit approval
// (see requirement 3).
async function classify(seed: HistoricalPostSeed): Promise<ClassificationResult> {
  if (seed.storedContentType === "question" || seed.storedContentType === "instruction") {
    return {
      eligibility: seed.storedContentType === "question" ? "skip_question" : "skip_instruction",
      classificationSource: "stored",
      classifiedContentType: seed.storedContentType,
      classifiedExtractedClaim: null,
    };
  }

  if (seed.storedContentType === "claim") {
    return {
      eligibility: "eligible_claim",
      classificationSource: "stored",
      classifiedContentType: "claim",
      classifiedExtractedClaim: null,
    };
  }

  // No stored signal - reproduce evaluateContentTruthPipeline's exact
  // classification semantics (timeout + retry + fail-open fallback), not a
  // bare call to screenContentWithAI, so the result matches what production
  // would actually have decided.
  const failOpen = process.env.AI_FAIL_OPEN === "true";
  let result;
  try {
    result = await withRetry(
      () => withTimeout(screenContentWithAI(seed.content), 8_000, "AI screening (backfill classify)"),
      { maxAttempts: 2, baseDelayMs: 300, label: "AI screening (backfill classify)" }
    );
  } catch (error) {
    if (!failOpen) throw error;
    const prev = process.env.AI_ENABLED;
    process.env.AI_ENABLED = "false";
    try {
      result = await screenContentWithAI(seed.content);
    } finally {
      process.env.AI_ENABLED = prev;
    }
  }
  return {
    eligibility: "needs_manual_review",
    classificationSource: "live_reclassification",
    classifiedContentType: result.contentType,
    classifiedExtractedClaim: result.extractedClaim,
  };
}

// The skip invariant must hold on classifiedContentType itself, independent
// of how the historical eligibility bucket was assigned. A stored "claim"
// post always has classifiedContentType "claim" (see classify() above), so
// this is a no-op for that bucket - but a needs_manual_review post whose
// live reclassification comes back "question"/"instruction" must be
// prevented from entering claim resolution at all, not merely left to rely
// on claimResolvedStage's defensive throw.
function isNonClaimContentType(contentType: ContentType): boolean {
  return contentType === "question" || contentType === "instruction";
}

// Apply-path only wrapper: persists classify()'s result onto the checkpoint.
// Never called from the dry-run path.
async function classifyStage(seed: HistoricalPostSeed, checkpoint: any) {
  if (stageAtLeast(checkpoint.stage, "classified")) return;
  const result = await classify(seed);
  checkpoint.eligibility = result.eligibility;
  checkpoint.classificationSource = result.classificationSource;
  checkpoint.classifiedContentType = result.classifiedContentType;
  checkpoint.classifiedExtractedClaim = result.classifiedExtractedClaim;
  checkpoint.stage = "classified";
  await checkpoint.save();
}

function isApprovedForApply(seed: HistoricalPostSeed, checkpoint: any, args: CliArgs): boolean {
  if (!args.applyIds.has(seed.postId)) return false;
  if (checkpoint.eligibility === "needs_manual_review") {
    return args.approveManualReview.has(seed.postId);
  }
  return checkpoint.eligibility === "eligible_claim";
}

// ---------------------------------------------------------------------------
// Stage 2: claim resolution. Reuses findOrCreateClaim exactly as production
// does - its own E11000-recovery already guarantees no duplicate Claim, and
// resolveGroundingPlan (also reused, not reimplemented) determines the exact
// grounding-query text the same way the live pipeline would.
// ---------------------------------------------------------------------------
async function claimResolvedStage(seed: HistoricalPostSeed, checkpoint: any) {
  if (stageAtLeast(checkpoint.stage, "claim_resolved")) return;

  const plan = resolveGroundingPlan({
    content: seed.content,
    contentType: checkpoint.classifiedContentType,
    extractedClaim: checkpoint.classifiedExtractedClaim,
  });
  if (plan.skipGrounding) {
    // Should not happen for anything reaching this stage (skip eligibility
    // is filtered before this is ever called), but guard defensively.
    throw new Error(`Post ${seed.postId}: resolveGroundingPlan says skip, but claimResolvedStage was invoked`);
  }

  const result = await findOrCreateClaim(plan.groundingQuery);
  checkpoint.claimId = result.claim._id;
  checkpoint.claimWasNewlyCreated = result.created;
  checkpoint.stage = "claim_resolved";
  await checkpoint.save();
}

// ---------------------------------------------------------------------------
// Stage 3: evidence. Once reached, never re-run - re-grounding after this
// point is exactly what the design review forbade (requirement 9).
// priorEvidenceObjectIds is captured BEFORE persistence so a later resume
// can reconstruct the true "prior to this run" evidence set even after this
// run's own evidence is already mixed into what getExistingEvidenceForClaim
// would return by then.
// ---------------------------------------------------------------------------
async function evidenceCompletedStage(seed: HistoricalPostSeed, checkpoint: any) {
  if (stageAtLeast(checkpoint.stage, "evidence_completed")) return;

  const claimId = String(checkpoint.claimId);
  const contentHash = hashContent(`${TRUTH_PIPELINE_CACHE_VERSION}:${seed.content}`);

  const priorEvidence: EvidenceForClaim[] = checkpoint.claimWasNewlyCreated
    ? []
    : await getExistingEvidenceForClaim(claimId);

  const plan = resolveGroundingPlan({
    content: seed.content,
    contentType: checkpoint.classifiedContentType,
    extractedClaim: checkpoint.classifiedExtractedClaim,
  });

  const webGrounding = await withRetry(
    () => withTimeout(runGroundedFactCheck(plan.groundingQuery), 25_000, "Web grounding (backfill)"),
    { maxAttempts: 2, baseDelayMs: 1_000, label: "Web grounding (backfill)" }
  ).catch(async (error) => {
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      try {
        return await runTavilyGrounding(plan.groundingQuery);
      } catch {
        // fall through to neutral grounding below
      }
    }
    console.warn(`Post ${seed.postId}: web grounding failed, proceeding with zero evidence candidates:`, error);
    return { groundingSources: [], evidenceCandidates: [], groundingStatus: "not_checked" as const, groundingSummary: "", evidenceRiskAdjustment: 0, raw: undefined };
  });

  const persisted = await persistEvidenceObjects({
    contentHash,
    claimId,
    candidates: webGrounding.evidenceCandidates,
  });

  checkpoint.contentHash = contentHash;
  checkpoint.evidenceObjectIds = persisted.map((p) => p.evidenceObjectId);
  checkpoint.priorEvidenceObjectIds = priorEvidence.map((e) => e.id);
  checkpoint.newEvidenceCreatedThisRun = persisted.some((p) => p.created);
  checkpoint.stage = "evidence_completed";
  await checkpoint.save();
}

async function evidenceObjectsToEvidenceForClaim(ids: string[]): Promise<EvidenceForClaim[]> {
  if (ids.length === 0) return [];
  const docs = await EvidenceObject.find({ _id: { $in: ids } }).select(
    "stance authorityScore relevanceScore stanceConfidence independenceGroup sourceType"
  );
  return docs.map((doc: any) => ({
    id: String(doc._id),
    stance: doc.stance,
    authorityScore: doc.authorityScore,
    relevanceScore: doc.relevanceScore,
    stanceConfidence: doc.stanceConfidence,
    independenceGroup: doc.independenceGroup,
    sourceType: doc.sourceType,
  }));
}

// ---------------------------------------------------------------------------
// Stage 4: version reservation. THE concurrency-critical step (see the
// design review). preAdvanceVersion is written durably BEFORE any advance is
// attempted, so a crash between the advance and recording its result is
// distinguishable from "no advance happened yet" on resume - and a version
// already moved past preAdvanceVersion by ANY actor (this script's own prior
// crashed attempt, or unrelated concurrent live traffic) is adopted rather
// than advanced again, because this run's evidence was already durably
// persisted before this check and is therefore already reflected in
// whatever assessment computes against that later version.
// ---------------------------------------------------------------------------
async function versionReservedStage(checkpoint: any) {
  if (stageAtLeast(checkpoint.stage, "version_reserved")) return;

  const claimId = String(checkpoint.claimId);

  if (checkpoint.preAdvanceVersion === null || checkpoint.preAdvanceVersion === undefined) {
    const claim = await Claim.findById(claimId).select("currentAssessmentVersion");
    checkpoint.preAdvanceVersion = claim.currentAssessmentVersion;
    await checkpoint.save();
  }

  const claimNow = await Claim.findById(claimId).select("currentAssessmentVersion");

  if (claimNow.currentAssessmentVersion > checkpoint.preAdvanceVersion) {
    checkpoint.reservedAssessmentVersion = claimNow.currentAssessmentVersion;
  } else if (checkpoint.claimWasNewlyCreated) {
    await touchClaimLastEvaluatedAt(claimId);
    checkpoint.reservedAssessmentVersion = checkpoint.preAdvanceVersion;
  } else if (checkpoint.newEvidenceCreatedThisRun) {
    const priorEvidence = await evidenceObjectsToEvidenceForClaim(
      (checkpoint.priorEvidenceObjectIds ?? []).map((id: any) => String(id))
    );
    await advanceClaimAssessmentVersion({ claimId, priorEvidence });
    const claimAfter = await Claim.findById(claimId).select("currentAssessmentVersion");
    checkpoint.reservedAssessmentVersion = claimAfter.currentAssessmentVersion;
  } else {
    await touchClaimLastEvaluatedAt(claimId);
    checkpoint.reservedAssessmentVersion = checkpoint.preAdvanceVersion;
  }

  checkpoint.stage = "version_reserved";
  await checkpoint.save();
}

// An assessment's supportingEvidenceIds/contradictingEvidenceIds/
// unresolvedEvidenceIds partition ALL evidence that fed its computation
// (see lib/trustAssessment.ts's computeTrustAssessmentFromEvidence - every
// item lands in exactly one of the three) - their union is therefore the
// complete evidence set a given TrustAssessment actually incorporated. This
// is the "good completion predicate" the concurrency review called for:
// merely finding a TrustAssessment at the reserved version is NOT
// sufficient proof it reflects this run's evidence (a concurrent writer can
// legitimately create/advance-to that same version using a DB snapshot
// taken before this run's own evidence was inserted) - only checking this
// union proves it.
function assessmentIncludesEvidence(assessment: any, requiredEvidenceIds: string[]): boolean {
  if (requiredEvidenceIds.length === 0) return true;
  const included = new Set<string>([
    ...((assessment.supportingEvidenceIds ?? []) as unknown[]).map(String),
    ...((assessment.contradictingEvidenceIds ?? []) as unknown[]).map(String),
    ...((assessment.unresolvedEvidenceIds ?? []) as unknown[]).map(String),
  ]);
  return requiredEvidenceIds.every((id) => included.has(id));
}

// Builds/pins a TrustAssessment at exactly targetVersion, reusing
// buildAndPersistTrustAssessment (unmodified) when the claim's current
// version still matches it, otherwise computing independently via the
// already-exported, pure computeTrustAssessment and creating the row
// directly - so nothing is ever attached to a later, unrelated version.
async function buildOrPinAssessment(claimId: string, targetVersion: number) {
  const claimNow = await Claim.findById(claimId).select("currentAssessmentVersion");
  if (claimNow.currentAssessmentVersion === targetVersion) {
    return await buildAndPersistTrustAssessment(claimId);
  }

  const computation = await computeTrustAssessment(claimId);
  try {
    return await TrustAssessment.create({
      claim: claimId,
      claimAssessmentVersion: targetVersion,
      evidenceStrength: {
        band: computation.evidenceStrength.band,
        score: computation.evidenceStrength.score,
        confidence: computation.evidenceStrength.confidence,
        independentSupportingCount: computation.evidenceStrength.independentSupportingCount,
        reasons: computation.evidenceStrength.reasons,
      },
      contradictionStrength: {
        band: computation.contradictionStrength.band,
        directCount: computation.contradictionStrength.directCount,
        weakCount: computation.contradictionStrength.weakCount,
        confidence: computation.contradictionStrength.confidence,
        reasons: computation.contradictionStrength.reasons,
      },
      verificationConfidence: {
        level: computation.verificationConfidence.level,
        score: computation.verificationConfidence.score,
        reasons: computation.verificationConfidence.reasons,
      },
      supportingEvidenceIds: computation.supportingEvidenceIds,
      contradictingEvidenceIds: computation.contradictingEvidenceIds,
      unresolvedEvidenceIds: computation.unresolvedEvidenceIds,
      assessmentBand: computation.assessmentBand,
      assessmentReasons: computation.assessmentReasons,
      modelVersion: TRUST_ASSESSMENT_MODEL_VERSION,
    });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 11000) {
      const winner = await TrustAssessment.findOne({ claim: claimId, claimAssessmentVersion: targetVersion });
      if (!winner) throw err;
      return winner;
    }
    throw err;
  }
}

const MAX_ASSESSMENT_RESERVATION_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Stage 5: assessment. Only ever records assessment_completed once the
// candidate TrustAssessment is PROVEN (via assessmentIncludesEvidence) to
// incorporate every EvidenceObject this run persisted - adopting a
// same-version assessment on the strength of the version number alone was
// shown to be unsafe (a concurrent writer can advance to, and build for,
// that exact version using a DB snapshot taken before this run's evidence
// existed). If the candidate fails that check, a genuinely new version is
// minted and the check retried, bounded by MAX_ASSESSMENT_RESERVATION_ATTEMPTS.
// This retry only ever engages when a real concurrent-write race is
// detected - it is not triggered by ordinary crash-and-resume retries, so it
// does not reintroduce the "reassessment churn from mere retries" problem
// the earlier design step eliminated.
// ---------------------------------------------------------------------------
async function assessmentCompletedStage(checkpoint: any) {
  if (stageAtLeast(checkpoint.stage, "assessment_completed")) return;

  const claimId = String(checkpoint.claimId);
  const requiredEvidenceIds: string[] = (checkpoint.evidenceObjectIds ?? []).map((id: any) => String(id));

  for (let attempt = 0; attempt < MAX_ASSESSMENT_RESERVATION_ATTEMPTS; attempt += 1) {
    const targetVersion = checkpoint.reservedAssessmentVersion;

    let candidate = await TrustAssessment.findOne({ claim: claimId, claimAssessmentVersion: targetVersion });
    if (!candidate) {
      candidate = await buildOrPinAssessment(claimId, targetVersion);
    }

    if (assessmentIncludesEvidence(candidate, requiredEvidenceIds)) {
      checkpoint.trustAssessmentId = candidate._id;
      checkpoint.stage = "assessment_completed";
      await checkpoint.save();
      return;
    }

    // The assessment sitting at our reserved version predates this run's
    // evidence - cannot be trusted. Mint a genuinely new version and retry.
    const priorEvidence = await evidenceObjectsToEvidenceForClaim(
      (checkpoint.priorEvidenceObjectIds ?? []).map((id: any) => String(id))
    );
    await advanceClaimAssessmentVersion({ claimId, priorEvidence });
    const claimAfter = await Claim.findById(claimId).select("currentAssessmentVersion");
    checkpoint.reservedAssessmentVersion = claimAfter.currentAssessmentVersion;
    await checkpoint.save();
  }

  throw new Error(
    `Claim ${claimId}: could not obtain a TrustAssessment incorporating this run's evidence after ${MAX_ASSESSMENT_RESERVATION_ATTEMPTS} attempts`
  );
}

// ---------------------------------------------------------------------------
// Stage 6: the final link. Filtered on claimId: null so a resumed run can
// never double-apply this, and so an already-linked post (by any prior
// attempt) is a guaranteed no-op.
// ---------------------------------------------------------------------------
async function postLinkedStage(seed: HistoricalPostSeed, checkpoint: any) {
  if (stageAtLeast(checkpoint.stage, "post_linked")) return;

  const claimId = String(checkpoint.claimId);
  const evidenceForClaim = await getExistingEvidenceForClaim(claimId);
  const evidenceAssessment =
    evidenceForClaim.length > 0
      ? assessEvidenceStrength(evidenceForClaim as EvidenceItemLike[])
      : undefined;

  await Post.updateOne(
    { _id: seed.postId, claimId: null },
    { $set: { claimId, ...(evidenceAssessment ? { evidenceAssessment } : {}) } }
  );

  checkpoint.stage = "post_linked";
  checkpoint.postLinkedAt = new Date();
  await checkpoint.save();
}

// ---------------------------------------------------------------------------
// Dry-run projection: identity + convergence + would-be action. GENUINELY
// ZERO writes - no checkpoint is created, read, or touched at all. classify()
// runs fresh, in memory, every single time (no caching), and the only
// database access is the two read-only Claim.findOne/computeClaimIdentity
// calls needed to report what WOULD happen. Safe to run repeatedly against
// production without changing any collection.
// ---------------------------------------------------------------------------
async function dryRunReportRow(seed: HistoricalPostSeed) {
  const classification = await classify(seed);

  if (
    classification.eligibility === "skip_question" ||
    classification.eligibility === "skip_instruction" ||
    isNonClaimContentType(classification.classifiedContentType)
  ) {
    const action =
      classification.classifiedContentType === "question" ? "SKIP_QUESTION" : "SKIP_INSTRUCTION";
    return {
      postId: seed.postId,
      action,
      eligibility: classification.eligibility,
      classificationSource: classification.classificationSource,
      classifiedContentType: classification.classifiedContentType,
    };
  }

  const plan = resolveGroundingPlan({
    content: seed.content,
    contentType: classification.classifiedContentType,
    extractedClaim: classification.classifiedExtractedClaim,
  });
  const identity = computeClaimIdentity(plan.groundingQuery);
  const existingClaim = await Claim.findOne({ identityKey: identity.identityKey }).select("_id");
  const convergesWith = HISTORICAL_POSTS.filter((other) => {
    if (other.postId === seed.postId) return false;
    if (other.storedContentType === "question" || other.storedContentType === "instruction") return false;
    return computeClaimIdentity(other.content).identityKey === identity.identityKey;
  }).map((other) => other.postId);

  return {
    postId: seed.postId,
    eligibility: classification.eligibility,
    classificationSource: classification.classificationSource,
    classifiedContentType: classification.classifiedContentType,
    action:
      classification.eligibility === "needs_manual_review"
        ? "NEEDS_MANUAL_REVIEW"
        : existingClaim
        ? "LINK_TO_EXISTING_CLAIM"
        : "WOULD_CREATE_NEW_CLAIM",
    computedIdentityKey: identity.identityKey,
    domain: identity.domain,
    claimType: identity.claimType,
    temporalScope: identity.temporalScope,
    jurisdiction: identity.jurisdiction,
    existingClaimId: existingClaim ? String(existingClaim._id) : null,
    convergesWithPostIds: convergesWith,
  };
}

async function applyPost(seed: HistoricalPostSeed, checkpoint: any) {
  checkpoint.attemptCount = (checkpoint.attemptCount ?? 0) + 1;
  checkpoint.lastAttemptAt = new Date();
  // Persisted immediately, before any stage runs - every invocation of
  // applyPost for an approved ID must be reflected in durable attemptCount,
  // including a no-op retry against an already-post_linked checkpoint,
  // where every stage function below returns early and would otherwise
  // never call .save() at all. This write touches only this checkpoint
  // document - no Claim/Evidence/TrustAssessment/Post collection is
  // involved, and no stage's completion state is altered.
  await checkpoint.save();
  try {
    await classifyStage(seed, checkpoint);
    if (
      checkpoint.eligibility === "skip_question" ||
      checkpoint.eligibility === "skip_instruction" ||
      isNonClaimContentType(checkpoint.classifiedContentType)
    ) {
      // Invariant: classifiedContentType === question/instruction always
      // means skip, regardless of which eligibility bucket a
      // needs_manual_review post landed in - this must hold independently
      // of the historical stored/live-reclassification split.
      return { postId: seed.postId, result: "SKIPPED", stage: checkpoint.stage };
    }
    await claimResolvedStage(seed, checkpoint);
    await evidenceCompletedStage(seed, checkpoint);
    await versionReservedStage(checkpoint);
    await assessmentCompletedStage(checkpoint);
    await postLinkedStage(seed, checkpoint);
    return { postId: seed.postId, result: "DONE", stage: checkpoint.stage };
  } catch (error: unknown) {
    checkpoint.lastError = {
      message: error instanceof Error ? error.message : String(error),
      stage: checkpoint.stage,
      at: new Date(),
    };
    await checkpoint.save();
    return { postId: seed.postId, result: "FAILED", stage: checkpoint.stage, error: checkpoint.lastError.message };
  }
}

async function main() {
  loadEnvFile();
  const mongoUri = process.env.MONGODB_URI ?? process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGODB_URI or MONGO_URI is required");

  const args = parseArgs(process.argv.slice(2));
  await mongoose.connect(mongoUri, { bufferCommands: false });

  const report: unknown[] = [];

  if (!args.apply) {
    for (const seed of HISTORICAL_POSTS) {
      report.push(await dryRunReportRow(seed));
    }
    console.log(JSON.stringify({ mode: "dry-run", count: report.length, report }, null, 2));
  } else {
    if (args.applyIds.size === 0) {
      throw new Error("--apply requires a non-empty --apply-ids=<id,id,...> allowlist");
    }
    const approved = HISTORICAL_POSTS.filter((seed) => args.applyIds.has(seed.postId));
    for (const seed of approved) {
      const checkpoint = await getOrCreateCheckpoint(seed.postId);
      await classifyStage(seed, checkpoint);
      if (!isApprovedForApply(seed, checkpoint, args)) {
        report.push({ postId: seed.postId, result: "NOT_APPROVED", eligibility: checkpoint.eligibility });
        continue;
      }
      report.push(await applyPost(seed, checkpoint));
    }
    console.log(JSON.stringify({ mode: "apply", count: report.length, report }, null, 2));
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
