import { Schema, model, models } from "mongoose";

// One EvidenceObject represents a single evidence SPAN from a single source,
// not "a source". The schema deliberately allows many EvidenceObjects to
// share the same sourceUrl (no unique constraint there) so a future
// extraction pass that finds multiple relevant spans in one page - possibly
// with different stances - doesn't require a migration. Sprint 1's actual
// extraction still produces at most one EvidenceObject per retrieved source,
// because that's the real granularity the current providers (OpenAI web
// search, Tavily) give us; see lib/evidencePersistence.ts.
//
// claimId is reserved for Sprint 2's Claim model and is unset until then.
// contentHash is what Sprint 1 actually keys evidence by - the same
// TRUTH_PIPELINE_CACHE_VERSION-scoped content hash GroundingCache already
// uses, since grounding is deduplicated/cached per content, not per post.
const EvidenceObjectSchema = new Schema(
  {
    claimId: {
      type: Schema.Types.ObjectId,
      ref: "Claim",
      default: null,
      index: true,
    },
    // Sprint 4 (Phase 10): optional finer-grained link to the specific
    // proposition (models/ClaimComponent.ts) within claimId that this
    // evidence actually targets - additive, does not replace claimId. A
    // source can support one component of a compound claim while
    // contradicting another; this is what lets that be represented without
    // forcing the whole claim onto one stance. Unset (null) whenever
    // component-level targeting wasn't determined - which is the case for
    // every EvidenceObject created before this sprint, and is a safe,
    // fully-compatible default (readers that only ever look at claimId are
    // unaffected).
    claimComponentId: {
      type: Schema.Types.ObjectId,
      ref: "ClaimComponent",
      default: null,
      index: true,
    },
    contentHash: {
      type: String,
      required: true,
      index: true,
    },

    sourceUrl: {
      type: String,
      required: true,
      trim: true,
    },
    // Heuristically normalized (stripped tracking params, lowercased host,
    // no trailing slash) via lib/sourceIndependence.ts - NOT a real
    // canonical-URL resolution (no <link rel="canonical"> or redirect
    // following, since neither provider fetches the page for us).
    canonicalUrl: {
      type: String,
      required: true,
      trim: true,
    },
    // Best-effort label derived from domain; neither provider reliably
    // returns a real publisher/organization name.
    publisher: {
      type: String,
      default: "",
      trim: true,
    },
    domain: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    sourceType: {
      type: String,
      enum: [
        "government",
        "academic",
        "institutional",
        "journalistic",
        "user_generated",
        "unknown",
      ],
      default: "unknown",
    },

    // Publish date, where a provider actually states one. Null (not a
    // fabricated guess) when unavailable - true for most OpenAI-path
    // sources today, since the web_search tool's research narrative rarely
    // states it explicitly.
    publishedAt: {
      type: Date,
      default: null,
    },
    retrievedAt: {
      type: Date,
      required: true,
    },

    // 0-1. Explicitly heuristic/tiered (lib/sourceAuthority.ts), not a
    // scientifically validated score - see that file's header comment.
    authorityScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    // 0-1. Tavily-path values are the provider's own reported relevance
    // score, used as-is. OpenAI-path values are a coarse heuristic (the
    // model already filtered to what it judged relevant) - see
    // lib/evidencePersistence.ts.
    relevanceScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },

    // Sources sharing an independenceGroup are NOT counted as independent
    // confirmations of each other - see lib/sourceIndependence.ts. Grouping
    // is conservative: it only merges across domains on a detected exact
    // evidenceText match (e.g. copied wire content). Everything else
    // defaults to one group per domain, which is a default, not a proven
    // claim of independence.
    independenceGroup: {
      type: String,
      required: true,
    },

    stance: {
      type: String,
      enum: ["supports", "contradicts", "context", "unknown"],
      default: "unknown",
    },
    // 0-1 heuristic confidence in the stance classification itself, distinct
    // from relevanceScore/authorityScore. See lib/evidencePersistence.ts for
    // how each provider path derives it.
    stanceConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },

    evidenceText: {
      type: String,
      default: null,
    },
    // Character offsets of evidenceText within the actual retrieved source
    // content. Only populated when we hold that real content (the Tavily
    // path, via include_raw_content). Null on the OpenAI path: the only text
    // available there is the model's own research narrative, not the source
    // page, so an offset into it would misrepresent it as a span into the
    // source itself - per Sprint 1's provenance rule, we lower confidence
    // (null) rather than fabricate a span.
    evidenceStart: {
      type: Number,
      default: null,
    },
    evidenceEnd: {
      type: Number,
      default: null,
    },
    // sha256 of evidenceText (lib/hash.ts), null when evidenceText is null.
    // Used by sourceIndependence.ts to detect identical spans duplicated
    // across different domains.
    evidenceHash: {
      type: String,
      default: null,
    },

    provider: {
      type: String,
      enum: ["openai", "tavily"],
      required: true,
    },
    // Groups every EvidenceObject produced by one grounding call together,
    // distinct from contentHash (which is stable across repeated/cached
    // checks of the same content over time - a re-check after cache expiry
    // gets a new providerRunId but the same contentHash).
    providerRunId: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

EvidenceObjectSchema.index({ contentHash: 1, providerRunId: 1 });
EvidenceObjectSchema.index({ contentHash: 1, stance: 1 });
// Sprint 2: supports both the per-claim dedup lookup in
// lib/evidencePersistence.ts and general "all evidence for this claim" reads.
EvidenceObjectSchema.index({ claimId: 1, sourceUrl: 1, evidenceHash: 1 });

export default models.EvidenceObject ||
  model("EvidenceObject", EvidenceObjectSchema);
