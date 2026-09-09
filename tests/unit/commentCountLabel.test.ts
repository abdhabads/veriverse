import { describe, it, expect } from "vitest";
import { formatCommentCountLabel } from "@/components/PostCard";

describe("formatCommentCountLabel", () => {
  it("shows a neutral label when comments haven't been fetched yet", () => {
    expect(formatCommentCountLabel(undefined)).toBe("Comments");
  });

  it("shows zero cleanly once a fetch confirms there are none", () => {
    expect(formatCommentCountLabel([])).toBe("No comments yet");
  });

  it("uses singular copy for exactly one comment", () => {
    expect(
      formatCommentCountLabel([{ _id: "1", author: { _id: "u1", username: "a" }, content: "hi" }])
    ).toBe("1 comment");
  });

  it("uses plural copy for more than one comment", () => {
    expect(
      formatCommentCountLabel([
        { _id: "1", author: { _id: "u1", username: "a" }, content: "hi" },
        { _id: "2", author: { _id: "u2", username: "b" }, content: "hey" },
      ])
    ).toBe("2 comments");
  });
});
