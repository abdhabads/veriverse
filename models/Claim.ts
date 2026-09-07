import { Schema, model, models } from "mongoose";

// A Claim is the underlying proposition being evaluated - distinct from any
// one Post that states it (many posts can restate the same claim) and
// distinct from the Evidence used to assess it. See lib/claimNormalization.ts
// for how identity is computed, and lib/claimIdentity.ts for how this model
// is found-or-created.
//
// subject/predicate/object are kept in the schema (per the sprint's
// requested field list) but are NOT populated yet - a real subject-verb-
// object extraction needs actual parsing, not a regex, and inventing fake
// values here would be exactly the kind of unearned precision Sprint 1
// already committed to avoiding. They're reserved so a future parsing pass
// doesn't require a migration.
const TemporalScopeSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["unspecified", "relative", "specific"],
      default: "unspecified",
    },
    // For "specific": an ISO-ish period like "2025-01" or "2025".
    // For "relative": the matched marker, e.g. "current", "today".
    // For "unspecified": null.
    value: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const ClaimSchema = new Schema(
  {
    // Lightly cleaned (trimmed/whitespace-collapsed) version of the text
    // first used to identify this claim - normally the extractedClaim from
    // classification, or the raw content when there's nothing to extract.
    // Human-readable, preserves original wording/casing.
    canonicalText: {
      type: String,
      required: true,
      trim: true,
    },
    // Aggressively normalized for matching (lowercased, punctuation
    // stripped, filler words trimmed, whitespace collapsed). See
    // lib/claimNormalization.ts.
    normalizedText: {
      type: String,
      required: true,
    },
    // sha256 of normalizedText + temporalScope.value + jurisdiction - the
    // actual database identity key. Not merely a text hash: two claims with
    // identical wording but different explicit dates/jurisdictions get
    // different keys (Phase 7/8). Unique - this is what makes find-or-create
    // race-safe (see lib/claimIdentity.ts).
    identityKey: {
      type: String,
      required: true,
      unique: true,
    },

    // Deterministic, regex-derived structural category - not a claim about
    // truth or domain, just the shape of the proposition.
    claimType: {
      type: String,
      enum: ["statistical", "comparative", "causal", "existential"],
      default: "existential",
    },
    subject: { type: String, default: null },
    predicate: { type: String, default: null },
    object: { type: String, default: null },

    // Deterministic, keyword-derived topical category - intentionally coarse.
    domain: {
      type: String,
      enum: ["medical", "political", "economic", "scientific", "general"],
      default: "general",
    },
    // Null = no jurisdiction signal detected (treated as unspecified/global,
    // NOT as "confirmed to apply everywhere"). See lib/claimNormalization.ts.
    jurisdiction: {
      type: String,
      default: null,
    },
    temporalScope: {
      type: TemporalScopeSchema,
      default: () => ({ type: "unspecified", value: null }),
    },

    // Best-effort, non-authoritative: set when a "possible match" (Phase 3's
    // third tier) was found against an existing claim at creation time, but
    // wasn't confident enough to auto-merge. Never read by any decision
    // logic - informational only, for future human/tooling review.
    possibleDuplicateOf: {
      type: Schema.Types.ObjectId,
      ref: "Claim",
      default: null,
    },

    firstSeenAt: {
      type: Date,
      required: true,
    },
    lastEvaluatedAt: {
      type: Date,
      default: null,
    },
    // Increments each time genuinely new evidence is attached to this claim
    // (see lib/claimIdentity.ts) - a count of evidence refreshes, not a
    // computed verdict. Historical states are preserved in
    // ClaimAssessmentSnapshot, never overwritten.
    currentAssessmentVersion: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
  },
  { timestamps: true }
);

ClaimSchema.index({ domain: 1, createdAt: -1 });

export default models.Claim || model("Claim", ClaimSchema);
