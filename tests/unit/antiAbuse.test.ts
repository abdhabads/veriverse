import { describe, it, expect } from "vitest";
import { canUserVote } from "@/lib/antiAbuse";

describe("anti abuse voting checks", () => {
  it("blocks very new accounts", () => {
    const result = canUserVote({
      accountCreatedAt: new Date(),
      lastVoteAt: null,
      dailyVoteCount: 0,
      dailyVoteCountDate: "",
      riskScore: 0,
    });

    expect(result.allowed).toBe(false);
  });

  it("blocks high-risk users", () => {
    const result = canUserVote({
      accountCreatedAt: new Date(Date.now() - 1000 * 60 * 60),
      lastVoteAt: null,
      dailyVoteCount: 0,
      dailyVoteCountDate: "",
      riskScore: 10,
    });

    expect(result.allowed).toBe(false);
  });

  it("allows normal user", () => {
    const result = canUserVote({
      accountCreatedAt: new Date(Date.now() - 1000 * 60 * 60),
      lastVoteAt: null,
      dailyVoteCount: 0,
      dailyVoteCountDate: "",
      riskScore: 0,
    });

    expect(result.allowed).toBe(true);
  });
});
