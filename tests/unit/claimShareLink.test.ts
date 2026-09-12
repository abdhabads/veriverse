// tests/unit/claimShareLink.test.ts
//
// P3.2: covers only the new Claim-sharing additions to lib/shareLink.ts.
// sharePost()'s own existing behavior is already covered by
// tests/unit/shareLink.test.ts and is unmodified by this phase - see that
// file for Post Share coverage.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildClaimShareUrl, buildClaimShareText, shareClaim } from "@/lib/shareLink";

const ORIGIN = "https://www.veriverse.io";

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: ORIGIN } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildClaimShareUrl", () => {
  it("builds the canonical claim URL, distinct from the Post share URL", () => {
    expect(buildClaimShareUrl("claim1")).toBe(`${ORIGIN}/claims/claim1`);
  });
});

describe("buildClaimShareText", () => {
  it("uses a concise generic line when no claim text is available (PostCard's actual usage)", () => {
    expect(buildClaimShareText(undefined)).toBe("See the current assessment of this claim on VeriVerse.");
    expect(buildClaimShareText(null)).toBe("See the current assessment of this claim on VeriVerse.");
    expect(buildClaimShareText("")).toBe("See the current assessment of this claim on VeriVerse.");
  });

  it("includes the claim text verbatim when short enough", () => {
    expect(buildClaimShareText("The bridge reopened last week.")).toBe(
      'See the current VeriVerse assessment of this claim: "The bridge reopened last week."'
    );
  });

  it("truncates an unusually long claim text rather than producing unwieldy share copy", () => {
    const longClaim = "A".repeat(200);
    const text = buildClaimShareText(longClaim);
    expect(text.length).toBeLessThan(200);
    expect(text).toContain("…");
  });

  it("never includes raw trust reasoning or AI-generated wording", () => {
    const text = buildClaimShareText("Some claim");
    expect(text.toLowerCase()).not.toContain("true");
    expect(text.toLowerCase()).not.toContain("false");
    expect(text.toLowerCase()).not.toContain("ai verdict");
  });
});

describe("shareClaim", () => {
  it("shares the Claim URL, not a Post URL - a separate action from sharePost()", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share: shareMock });

    const result = await shareClaim({ claimId: "claim42" });

    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${ORIGIN}/claims/claim42` })
    );
    expect(result.status).toBe("shared");
  });

  it("falls back to clipboard with the claim URL when native share is unavailable", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: writeTextMock } });

    const result = await shareClaim({ claimId: "claim43" });

    expect(writeTextMock).toHaveBeenCalledWith(`${ORIGIN}/claims/claim43`);
    expect(result).toEqual({ status: "copied", message: "Link copied" });
  });
});
