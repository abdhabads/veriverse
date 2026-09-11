// tests/unit/commentThread.test.ts
// P2.6: the two pure functions behind bounded visual nesting -
// isBareDepth() decides when a reply stops getting its own bordered card
// (so padding stops compounding with depth), and resolveParentUsername()
// resolves "Replying to @username" from already-loaded comment data with
// no extra request. These are exactly the two mechanisms the P2.6 audit's
// mobile stress test showed were missing.
import { describe, it, expect } from "vitest";
import { isBareDepth, resolveParentUsername, type Comment } from "@/components/CommentThread";

function makeComment(overrides: Partial<Comment> & { _id: string; author: Comment["author"] }): Comment {
  return {
    content: "content",
    createdAt: "2026-01-01T00:00:00.000Z",
    parentComment: null,
    ...overrides,
  };
}

describe("isBareDepth", () => {
  it("is false at the top level (depth 0)", () => {
    expect(isBareDepth(0)).toBe(false);
  });

  it("is false at the first reply level (depth 1)", () => {
    expect(isBareDepth(1)).toBe(false);
  });

  it("is true from the second reply level onward (depth >= 2)", () => {
    expect(isBareDepth(2)).toBe(true);
    expect(isBareDepth(3)).toBe(true);
    expect(isBareDepth(4)).toBe(true);
    expect(isBareDepth(10)).toBe(true);
  });
});

describe("resolveParentUsername", () => {
  const top = makeComment({ _id: "top", author: { _id: "u1", username: "alice" } });
  const reply1 = makeComment({
    _id: "reply1",
    author: { _id: "u2", username: "bob" },
    parentComment: "top",
  });
  const commentsById: Record<string, Comment> = { top, reply1 };

  it("returns undefined for a top-level comment (depth 0), regardless of parentComment", () => {
    expect(resolveParentUsername(top, 0, commentsById)).toBeUndefined();
  });

  it("resolves the parent's username for a depth-1 reply", () => {
    expect(resolveParentUsername(reply1, 1, commentsById)).toBe("alice");
  });

  it("resolves the immediate parent's username for a depth >= 2 reply, not the root ancestor", () => {
    const reply2 = makeComment({
      _id: "reply2",
      author: { _id: "u3", username: "carol" },
      parentComment: "reply1",
    });
    const withReply2 = { ...commentsById, reply2 };
    expect(resolveParentUsername(reply2, 2, withReply2)).toBe("bob");
  });

  it("returns undefined when parentComment is missing", () => {
    expect(resolveParentUsername(top, 1, commentsById)).toBeUndefined();
  });

  it("returns undefined when the parent comment isn't in the loaded set", () => {
    const orphan = makeComment({
      _id: "orphan",
      author: { _id: "u4", username: "dave" },
      parentComment: "does-not-exist",
    });
    expect(resolveParentUsername(orphan, 1, commentsById)).toBeUndefined();
  });
});
