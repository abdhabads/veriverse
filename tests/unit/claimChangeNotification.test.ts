// tests/unit/claimChangeNotification.test.ts
//
// Integration-level tests (real local test MongoDB, same pattern as
// tests/unit/trustAssessment.test.ts) for P3.4's meaningful-change
// classification, deterministic copy, and the event+fanout orchestration -
// including the corrected retry semantics: a durable ClaimChangeEvent is an
// idempotency anchor, not a fanout-completion flag, so a partial delivery
// failure must be repairable on retry without duplicating any delivered
// notification.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import mongoose from "mongoose";
import Claim from "@/models/Claim";
import ClaimFollow from "@/models/ClaimFollow";
import ClaimChangeEvent from "@/models/ClaimChangeEvent";
import Notification from "@/models/Notification";
import User from "@/models/User";
import { findOrCreateClaim } from "@/lib/claimIdentity";
import {
  classifyClaimChange,
  getClaimChangeMessage,
  recordClaimChangeAndNotify,
} from "@/lib/claimChangeNotification";

const uri = process.env.MONGO_URI;

let claimIds: mongoose.Types.ObjectId[] = [];
let userIds: mongoose.Types.ObjectId[] = [];

async function makeUser() {
  const suffix = new mongoose.Types.ObjectId().toString();
  const user = await User.create({
    username: `claimchange_${suffix}`,
    email: `claimchange_${suffix}@test.com`,
    password: "hashed_password_not_real",
  });
  userIds.push(user._id);
  return user;
}

async function makeClaim() {
  const { claim } = await findOrCreateClaim(`Claim change test claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  return claim;
}

beforeAll(async () => {
  if (!uri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(uri);
});

afterEach(async () => {
  await Promise.all([
    Claim.deleteMany({ _id: { $in: claimIds } }),
    ClaimFollow.deleteMany({ claim: { $in: claimIds } }),
    ClaimChangeEvent.deleteMany({ claim: { $in: claimIds } }),
    Notification.deleteMany({ referenceClaim: { $in: claimIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);
  claimIds = [];
  userIds = [];
  vi.restoreAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe("classifyClaimChange - pure classification", () => {
  it("classifies a brand-new claim's first assessment as initial_assessment", () => {
    const result = classifyClaimChange({
      isInitialAssessment: true,
      previousBand: null,
      currentBand: "well_supported",
      previousCounts: null,
      currentCounts: { supportingCount: 3, contradictingCount: 0 },
    });
    expect(result).toBe("initial_assessment");
  });

  it("classifies any band-to-different-band transition as band_changed, without severity tiers", () => {
    const pairs: Array<[string, string]> = [
      ["weakly_supported", "contested"],
      ["contested", "contradicted"],
      ["insufficient_evidence", "well_supported"],
      ["well_supported", "contradicted"],
    ];
    for (const [from, to] of pairs) {
      const result = classifyClaimChange({
        isInitialAssessment: false,
        previousBand: from as any,
        currentBand: to as any,
        previousCounts: { supportingCount: 1, contradictingCount: 1 },
        currentCounts: { supportingCount: 1, contradictingCount: 1 },
      });
      expect(result).toBe("band_changed");
    }
  });

  it("produces no event for a same-version/no-new-evidence run (no previous data to compare)", () => {
    // Mirrors the pipeline's own "no new evidence" branch, where the
    // integration code never populates previousBand at all.
    const result = classifyClaimChange({
      isInitialAssessment: false,
      previousBand: null,
      currentBand: "contested",
      previousCounts: null,
      currentCounts: { supportingCount: 2, contradictingCount: 1 },
    });
    expect(result).toBeNull();
  });

  it("produces no event for ordinary same-band evidence growth (2 supporting -> 3 supporting)", () => {
    const result = classifyClaimChange({
      isInitialAssessment: false,
      previousBand: "well_supported",
      currentBand: "well_supported",
      previousCounts: { supportingCount: 2, contradictingCount: 0 },
      currentCounts: { supportingCount: 3, contradictingCount: 0 },
    });
    expect(result).toBeNull();
  });

  it("produces evidence_shifted_same_band when contradicting evidence crosses zero, band unchanged", () => {
    const result = classifyClaimChange({
      isInitialAssessment: false,
      previousBand: "weakly_supported",
      currentBand: "weakly_supported",
      previousCounts: { supportingCount: 2, contradictingCount: 0 },
      currentCounts: { supportingCount: 2, contradictingCount: 1 },
    });
    expect(result).toBe("evidence_shifted_same_band");
  });

  it("produces evidence_shifted_same_band when supporting evidence crosses zero, band unchanged", () => {
    const result = classifyClaimChange({
      isInitialAssessment: false,
      previousBand: "insufficient_evidence",
      currentBand: "insufficient_evidence",
      previousCounts: { supportingCount: 0, contradictingCount: 0 },
      currentCounts: { supportingCount: 1, contradictingCount: 0 },
    });
    expect(result).toBe("evidence_shifted_same_band");
  });

  it("does not consider confidence at all - the function has no confidence input", () => {
    // classifyClaimChange's signature only accepts band and support/contradict
    // counts - there is no way to pass a confidence-only change and have it
    // trigger anything, by construction.
    const result = classifyClaimChange({
      isInitialAssessment: false,
      previousBand: "well_supported",
      currentBand: "well_supported",
      previousCounts: { supportingCount: 2, contradictingCount: 0 },
      currentCounts: { supportingCount: 2, contradictingCount: 0 },
    });
    expect(result).toBeNull();
  });

  it("fails safe (no event) when the exact previous assessment is missing, rather than guessing", () => {
    const result = classifyClaimChange({
      isInitialAssessment: false,
      previousBand: null,
      currentBand: "contradicted",
      previousCounts: null,
      currentCounts: { supportingCount: 0, contradictingCount: 3 },
    });
    expect(result).toBeNull();
  });
});

describe("getClaimChangeMessage - deterministic copy", () => {
  it("never uses TRUE/FALSE, raw band strings, or AI language", () => {
    const messages = [
      getClaimChangeMessage("initial_assessment", "well_supported"),
      getClaimChangeMessage("band_changed", "contradicted"),
      getClaimChangeMessage("evidence_shifted_same_band", "contested"),
    ];
    for (const message of messages) {
      expect(message.toLowerCase()).not.toContain("true");
      expect(message.toLowerCase()).not.toContain("false");
      expect(message.toLowerCase()).not.toContain("ai ");
      expect(message).not.toContain("well_supported");
      expect(message).not.toContain("contradicted".toUpperCase());
    }
  });

  it("reuses the exact presentation label for band_changed copy", () => {
    expect(getClaimChangeMessage("band_changed", "contested")).toBe("A claim you follow is now Contested.");
  });
});

describe("recordClaimChangeAndNotify - event idempotency and fanout", () => {
  it("creates exactly one ClaimChangeEvent for a band transition", async () => {
    const claim = await makeClaim();
    await recordClaimChangeAndNotify({
      claimId: String(claim._id),
      fromAssessmentVersion: 1,
      toAssessmentVersion: 2,
      changeType: "band_changed",
      fromAssessmentBand: "weakly_supported",
      toAssessmentBand: "contested",
    });

    const events = await ClaimChangeEvent.find({ claim: claim._id });
    expect(events.length).toBe(1);
    expect(events[0].toAssessmentVersion).toBe(2);
    expect(events[0].changeType).toBe("band_changed");
  });

  it("reuses the same event on duplicate processing, never creating a second one", async () => {
    const claim = await makeClaim();
    const params = {
      claimId: String(claim._id),
      fromAssessmentVersion: 1,
      toAssessmentVersion: 2,
      changeType: "band_changed" as const,
      fromAssessmentBand: "weakly_supported" as const,
      toAssessmentBand: "contested" as const,
    };

    await recordClaimChangeAndNotify(params);
    await recordClaimChangeAndNotify(params);

    const events = await ClaimChangeEvent.find({ claim: claim._id });
    expect(events.length).toBe(1);
  });

  it("notifies exactly followers, never non-followers, with correct references", async () => {
    const claim = await makeClaim();
    const follower = await makeUser();
    const nonFollower = await makeUser();
    await ClaimFollow.create({ user: follower._id, claim: claim._id });

    await recordClaimChangeAndNotify({
      claimId: String(claim._id),
      fromAssessmentVersion: 1,
      toAssessmentVersion: 2,
      changeType: "band_changed",
      fromAssessmentBand: "weakly_supported",
      toAssessmentBand: "contested",
    });

    const followerNotifications = await Notification.find({ user: follower._id, type: "claim_updated" });
    expect(followerNotifications.length).toBe(1);
    expect(String(followerNotifications[0].referenceClaim)).toBe(String(claim._id));
    expect(followerNotifications[0].referenceClaimChangeEvent).toBeTruthy();
    expect(followerNotifications[0].message).toBe("A claim you follow is now Contested.");

    const nonFollowerNotifications = await Notification.find({ user: nonFollower._id, type: "claim_updated" });
    expect(nonFollowerNotifications.length).toBe(0);
  });

  it("does not duplicate an already-delivered notification when fanout is retried", async () => {
    const claim = await makeClaim();
    const follower = await makeUser();
    await ClaimFollow.create({ user: follower._id, claim: claim._id });

    const params = {
      claimId: String(claim._id),
      fromAssessmentVersion: 1,
      toAssessmentVersion: 2,
      changeType: "band_changed" as const,
      fromAssessmentBand: "weakly_supported" as const,
      toAssessmentBand: "contested" as const,
    };

    await recordClaimChangeAndNotify(params);
    await recordClaimChangeAndNotify(params); // retry - event already exists, fanout re-attempted

    const notifications = await Notification.find({ user: follower._id, type: "claim_updated" });
    expect(notifications.length).toBe(1);
  });

  it("THE CRITICAL CORRECTION: a partial fanout failure followed by retry fills in previously missing notifications, without duplicating the one that already succeeded", async () => {
    const claim = await makeClaim();
    const followerA = await makeUser();
    const followerB = await makeUser();
    await ClaimFollow.create({ user: followerA._id, claim: claim._id });
    await ClaimFollow.create({ user: followerB._id, claim: claim._id });

    const params = {
      claimId: String(claim._id),
      fromAssessmentVersion: 1,
      toAssessmentVersion: 2,
      changeType: "band_changed" as const,
      fromAssessmentBand: "weakly_supported" as const,
      toAssessmentBand: "contested" as const,
    };

    // First attempt: force the event to be created, but only followerA's
    // notification actually lands (simulating a partial insertMany failure
    // - e.g. the process crashing between the two inserts). We simulate
    // this directly by creating the event + one notification by hand,
    // exactly as an incomplete first attempt would have left things.
    const event = await ClaimChangeEvent.create({
      claim: claim._id,
      fromAssessmentVersion: 1,
      toAssessmentVersion: 2,
      changeType: "band_changed",
      fromAssessmentBand: "weakly_supported",
      toAssessmentBand: "contested",
    });
    await Notification.create({
      user: followerA._id,
      type: "claim_updated",
      message: "A claim you follow is now Contested.",
      referenceClaim: claim._id,
      referenceClaimChangeEvent: event._id,
    });

    // Retry: the event already exists (this is exactly what the correction
    // requires - event existence must NOT be treated as "fanout already
    // finished"). followerB was never notified and must be repaired;
    // followerA must not receive a second notification.
    await recordClaimChangeAndNotify(params);

    const events = await ClaimChangeEvent.find({ claim: claim._id });
    expect(events.length).toBe(1); // still exactly one event

    const followerANotifications = await Notification.find({ user: followerA._id, type: "claim_updated" });
    expect(followerANotifications.length).toBe(1); // not duplicated

    const followerBNotifications = await Notification.find({ user: followerB._id, type: "claim_updated" });
    expect(followerBNotifications.length).toBe(1); // repaired
  });

  it("tolerates a duplicate-key-only bulk write failure without throwing", async () => {
    const claim = await makeClaim();
    const follower = await makeUser();
    await ClaimFollow.create({ user: follower._id, claim: claim._id });

    const params = {
      claimId: String(claim._id),
      fromAssessmentVersion: 1,
      toAssessmentVersion: 2,
      changeType: "band_changed" as const,
      fromAssessmentBand: "weakly_supported" as const,
      toAssessmentBand: "contested" as const,
    };

    await recordClaimChangeAndNotify(params);
    // Retrying with the single follower already fully delivered exercises
    // the all-duplicates path of insertMany's error handling end to end.
    await expect(recordClaimChangeAndNotify(params)).resolves.toBeUndefined();
  });

  it("logs but does not throw on a non-duplicate delivery error, and never affects the caller", async () => {
    const claim = await makeClaim();
    const follower = await makeUser();
    await ClaimFollow.create({ user: follower._id, claim: claim._id });

    const insertManySpy = vi.spyOn(Notification, "insertMany").mockRejectedValueOnce(
      Object.assign(new Error("simulated non-duplicate write failure"), {
        name: "MongoBulkWriteError",
        writeErrors: [{ err: { code: 12345 } }],
      })
    );

    await expect(
      recordClaimChangeAndNotify({
        claimId: String(claim._id),
        fromAssessmentVersion: 1,
        toAssessmentVersion: 2,
        changeType: "band_changed",
        fromAssessmentBand: "weakly_supported",
        toAssessmentBand: "contested",
      })
    ).resolves.toBeUndefined();

    expect(insertManySpy).toHaveBeenCalledOnce();
    // The event itself must still exist - a notification-layer failure must
    // never roll back or prevent the durable event.
    const events = await ClaimChangeEvent.find({ claim: claim._id });
    expect(events.length).toBe(1);
  });

  it("records initial_assessment with null from-fields, and notifies a follower who happens to already exist", async () => {
    const claim = await makeClaim();
    const follower = await makeUser();
    // An unusual but not impossible case per the audit's correction: a
    // follower already exists for an assessment-less Claim. No special
    // lifecycle machinery is built for this - ordinary fanout simply works
    // if it happens to apply.
    await ClaimFollow.create({ user: follower._id, claim: claim._id });

    await recordClaimChangeAndNotify({
      claimId: String(claim._id),
      fromAssessmentVersion: null,
      toAssessmentVersion: 1,
      changeType: "initial_assessment",
      fromAssessmentBand: null,
      toAssessmentBand: "well_supported",
    });

    const events = await ClaimChangeEvent.find({ claim: claim._id });
    expect(events.length).toBe(1);
    expect(events[0].fromAssessmentVersion).toBeNull();
    expect(events[0].fromAssessmentBand).toBeNull();
    expect(events[0].changeType).toBe("initial_assessment");

    const notifications = await Notification.find({ user: follower._id, type: "claim_updated" });
    expect(notifications.length).toBe(1);
    expect(notifications[0].message).toBe("A claim you follow now has an assessment: Well Supported.");
  });

  it("does not duplicate the initial_assessment event on retry", async () => {
    const claim = await makeClaim();
    const params = {
      claimId: String(claim._id),
      fromAssessmentVersion: null,
      toAssessmentVersion: 1,
      changeType: "initial_assessment" as const,
      fromAssessmentBand: null,
      toAssessmentBand: "insufficient_evidence" as const,
    };

    await recordClaimChangeAndNotify(params);
    await recordClaimChangeAndNotify(params);

    const events = await ClaimChangeEvent.find({ claim: claim._id });
    expect(events.length).toBe(1);
  });

  it("skips fanout entirely when the claim has no followers, without error", async () => {
    const claim = await makeClaim();
    await expect(
      recordClaimChangeAndNotify({
        claimId: String(claim._id),
        fromAssessmentVersion: 1,
        toAssessmentVersion: 2,
        changeType: "band_changed",
        fromAssessmentBand: "weakly_supported",
        toAssessmentBand: "contested",
      })
    ).resolves.toBeUndefined();

    const events = await ClaimChangeEvent.find({ claim: claim._id });
    expect(events.length).toBe(1);
    const notifications = await Notification.find({ referenceClaim: claim._id });
    expect(notifications.length).toBe(0);
  });
});
