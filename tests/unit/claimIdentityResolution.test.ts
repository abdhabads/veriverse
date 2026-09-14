// tests/unit/claimIdentityResolution.test.ts
//
// P5.1: proves resolveExistingClaim (the read-only counterpart to
// findOrCreateClaim used by the anonymous verification lookup) never
// mutates on a miss, and that its exact/high_confidence matching decision
// is provably identical to findOrCreateClaim's own duplicate-key branch
// for the same input - not merely "similar," the exact same tier for the
// exact same text pair. Integration-level (real local test MongoDB), same
// pattern as tests/unit/claimIdentity.test.ts.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import Claim from "@/models/Claim";
import { findOrCreateClaim, resolveExistingClaim } from "@/lib/claimIdentity";

const uri = process.env.MONGO_URI;
let claimIds: mongoose.Types.ObjectId[] = [];

beforeAll(async () => {
  if (!uri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(uri);
});

afterEach(async () => {
  await Claim.deleteMany({ _id: { $in: claimIds } });
  claimIds = [];
});

afterAll(async () => {
  await mongoose.disconnect();
});

function track(claim: any) {
  claimIds.push(claim._id);
  return claim;
}

describe("resolveExistingClaim - non-mutation on a miss", () => {
  it("returns null for text with no existing Claim, without creating one", async () => {
    const text = `A never-before-seen claim ${new mongoose.Types.ObjectId()} exists in no database`;
    const before = await Claim.countDocuments({});

    const result = await resolveExistingClaim(text);
    expect(result).toBeNull();

    const after = await Claim.countDocuments({});
    expect(after).toBe(before);
  });

  it("still returns null on a second lookup of the same never-seen text - proves no side effect from the first call", async () => {
    const text = `Repeated miss claim ${new mongoose.Types.ObjectId()} still resolves to nothing`;
    expect(await resolveExistingClaim(text)).toBeNull();
    expect(await resolveExistingClaim(text)).toBeNull();
  });
});

describe("resolveExistingClaim - exact match", () => {
  it("finds an existing claim with matchTier 'exact' for identical text", async () => {
    const text = `Exact match claim ${new mongoose.Types.ObjectId()} was tested`;
    const created = track((await findOrCreateClaim(text)).claim);

    const result = await resolveExistingClaim(text);
    expect(result).not.toBeNull();
    expect(result!.matchTier).toBe("exact");
    expect(String(result!.claim._id)).toBe(String(created._id));
  });
});

describe("resolveExistingClaim - high_confidence match", () => {
  it("finds an existing claim with matchTier 'high_confidence' when wording differs but normalizes identically", async () => {
    const suffix = new mongoose.Types.ObjectId();
    const original = `The economy grew 3% last quarter ${suffix}`;
    // Leading "The " filler stripped, trailing ", right?" filler stripped -
    // both normalize to the same text, but canonicalText differs.
    const reworded = `Economy grew 3% last quarter ${suffix}, right?`;

    const created = track((await findOrCreateClaim(original)).claim);

    const result = await resolveExistingClaim(reworded);
    expect(result).not.toBeNull();
    expect(result!.matchTier).toBe("high_confidence");
    expect(String(result!.claim._id)).toBe(String(created._id));
  });
});

describe("resolveExistingClaim - equivalence with findOrCreateClaim's own matching decision", () => {
  it("agrees exactly with findOrCreateClaim's matchTier for an exact-text duplicate", async () => {
    const text = `Equivalence exact claim ${new mongoose.Types.ObjectId()} check`;
    track((await findOrCreateClaim(text)).claim);

    const viaCreate = await findOrCreateClaim(text); // created: false, some tier
    track(viaCreate.claim);
    const viaResolve = await resolveExistingClaim(text);

    expect(viaCreate.created).toBe(false);
    expect(viaResolve).not.toBeNull();
    expect(viaResolve!.matchTier).toBe(viaCreate.matchTier);
  });

  it("agrees exactly with findOrCreateClaim's matchTier for a high_confidence duplicate", async () => {
    const suffix = new mongoose.Types.ObjectId();
    const original = `The market fell sharply today ${suffix}`;
    const reworded = `Market fell sharply today ${suffix}, right?`;
    track((await findOrCreateClaim(original)).claim);

    const viaCreate = await findOrCreateClaim(reworded); // created: false
    track(viaCreate.claim);
    const viaResolve = await resolveExistingClaim(reworded);

    expect(viaCreate.created).toBe(false);
    expect(viaCreate.matchTier).toBe("high_confidence");
    expect(viaResolve).not.toBeNull();
    expect(viaResolve!.matchTier).toBe(viaCreate.matchTier);
  });

  it("never returns a 'possible' (fuzzy) match - only exact/high_confidence, exactly like findOrCreateClaim never auto-merging on one", async () => {
    // Deliberately share only some tokens with an existing claim rather
    // than normalizing identically - a genuine "possible" case for
    // findPossibleDuplicate, which resolveExistingClaim must never surface
    // as if it were an authoritative match.
    const suffix = new mongoose.Types.ObjectId();
    const original = `Inflation reached five percent this year in the capital ${suffix}`;
    const looselyRelated = `Some economists say inflation reached five percent this year ${suffix}`;
    track((await findOrCreateClaim(original)).claim);

    const result = await resolveExistingClaim(looselyRelated);
    expect(result).toBeNull();
  });
});
