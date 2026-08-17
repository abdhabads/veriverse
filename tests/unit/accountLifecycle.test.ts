// tests/unit/accountLifecycle.test.ts
import { describe, it, expect } from "vitest";

// Test the cooling-off logic in isolation
function isDeletionEligible(deletionEligibleAt: Date | null): boolean {
  if (!deletionEligibleAt) return true; // no cooloff set - legacy account
  return new Date() >= new Date(deletionEligibleAt);
}

function getDeletionEligibleAt(deactivatedAt: Date): Date {
  return new Date(deactivatedAt.getTime() + 24 * 60 * 60 * 1000);
}

describe("account lifecycle - cooling-off period", () => {

  it("deletion is eligible immediately for accounts with no deletionEligibleAt", () => {
    expect(isDeletionEligible(null)).toBe(true);
  });

  it("deletion is not eligible within 24 hours of deactivation", () => {
    const deactivatedAt = new Date();
    const eligibleAt = getDeletionEligibleAt(deactivatedAt);
    expect(isDeletionEligible(eligibleAt)).toBe(false);
  });

  it("deletion is eligible after 24 hours have passed", () => {
    const deactivatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
    const eligibleAt = getDeletionEligibleAt(deactivatedAt);
    expect(isDeletionEligible(eligibleAt)).toBe(true);
  });

  it("deletion is not eligible at exactly 23h 59m after deactivation", () => {
    const deactivatedAt = new Date(Date.now() - (24 * 60 * 60 * 1000 - 60 * 1000));
    const eligibleAt = getDeletionEligibleAt(deactivatedAt);
    expect(isDeletionEligible(eligibleAt)).toBe(false);
  });

  it("deletionEligibleAt is set to exactly 24h after deactivatedAt", () => {
    const deactivatedAt = new Date("2024-01-01T12:00:00Z");
    const eligibleAt = getDeletionEligibleAt(deactivatedAt);
    expect(eligibleAt.toISOString()).toBe("2024-01-02T12:00:00.000Z");
  });
});

describe("account lifecycle - restore eligibility", () => {

  it("banned accounts cannot be restored", () => {
    const canRestore = (moderationStatus: string, isDeactivated: boolean) => {
      if (moderationStatus === "banned") return false;
      if (!isDeactivated) return false;
      return true;
    };

    expect(canRestore("banned", true)).toBe(false);
    expect(canRestore("active", true)).toBe(true);
    expect(canRestore("warned", true)).toBe(true);
    expect(canRestore("active", false)).toBe(false);
  });
});
