import { describe, it, expect } from "vitest";
import { isPostAppealable } from "@/lib/appealEligibility";

describe("isPostAppealable", () => {
  it("allows appeal for a flagged post", () => {
    expect(isPostAppealable({ status: "flagged" })).toBe(true);
  });

  it("allows appeal for a false post", () => {
    expect(isPostAppealable({ status: "false" })).toBe(true);
  });

  it("allows appeal for a disputed post", () => {
    expect(isPostAppealable({ status: "disputed" })).toBe(true);
  });

  it("does not allow appeal for a plain unverified claim post", () => {
    expect(isPostAppealable({ status: "unverified", contentType: "claim" })).toBe(false);
  });

  it("allows appeal for an unverified post classified as a question - contesting the classification", () => {
    expect(isPostAppealable({ status: "unverified", contentType: "question" })).toBe(true);
  });

  it("allows appeal for an unverified post classified as an instruction", () => {
    expect(isPostAppealable({ status: "unverified", contentType: "instruction" })).toBe(true);
  });

  it("does not allow appeal for an unverified post with no contentType at all", () => {
    expect(isPostAppealable({ status: "unverified" })).toBe(false);
  });
});
