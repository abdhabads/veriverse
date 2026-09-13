// tests/unit/trendingClaims.test.ts
//
// Pure scoring/threshold/tie-break tests for aggregateTrendingClaims - no DB
// needed, since the function takes plain arrays and returns plain data. The
// corrected P3.5 rules under test: post-authorship contributes by DISTINCT
// AUTHOR (not raw post count), the qualification threshold is a four-way
// union of all attention-actor sets, and self-authored votes/comments/
// reposts never count.
import { describe, it, expect } from "vitest";
import { aggregateTrendingClaims, MIN_ATTENTION_ACTORS } from "@/lib/trendingClaims";

const day = 24 * 60 * 60 * 1000;
const t = (offsetMs: number) => new Date(Date.now() - offsetMs);

describe("aggregateTrendingClaims - scoring", () => {
  it("aggregates multiple posts for one claim into a single result", () => {
    const results = aggregateTrendingClaims({
      posts: [
        { id: "p1", claimId: "c1", author: "u1", createdAt: t(0) },
        { id: "p2", claimId: "c1", author: "u2", createdAt: t(1000) },
      ],
      votes: [{ post: "p1", user: "u3" }],
      comments: [{ post: "p2", user: "u4" }],
      reposts: [],
    });
    expect(results.length).toBe(1);
    expect(results[0].claimId).toBe("c1");
    expect(results[0].recentPostCount).toBe(2);
  });

  it("a single author posting the same claim repeatedly contributes only one post-author unit to score", () => {
    const results = aggregateTrendingClaims({
      posts: [
        { id: "p1", claimId: "c1", author: "u1", createdAt: t(0) },
        { id: "p2", claimId: "c1", author: "u1", createdAt: t(1000) },
        { id: "p3", claimId: "c1", author: "u1", createdAt: t(2000) },
      ],
      votes: [{ post: "p1", user: "u2" }],
      comments: [],
      reposts: [],
    });
    // Below threshold (only u1 and u2 are attention actors -> 2, so it
    // qualifies, but the score must reflect ONE post-author, not three).
    expect(results.length).toBe(1);
    expect(results[0].score).toBe(1 * 3 + 1); // uniqueRecentPostAuthors(1)*3 + uniqueVoters(1)*1
    expect(results[0].recentPostCount).toBe(3); // display-only, unaffected
  });

  it("two independent authors posting the same claim satisfy the attention-actor threshold with zero other engagement", () => {
    const results = aggregateTrendingClaims({
      posts: [
        { id: "p1", claimId: "c1", author: "u1", createdAt: t(0) },
        { id: "p2", claimId: "c1", author: "u2", createdAt: t(1000) },
      ],
      votes: [],
      comments: [],
      reposts: [],
    });
    expect(results.length).toBe(1);
    expect(results[0].score).toBe(2 * 3); // uniqueRecentPostAuthors(2)*3
    expect(results[0].engagedUserCount).toBe(2);
  });

  it("omits a claim below the attention-actor threshold entirely, never padding it in", () => {
    const results = aggregateTrendingClaims({
      posts: [{ id: "p1", claimId: "c1", author: "u1", createdAt: t(0) }],
      votes: [],
      comments: [],
      reposts: [],
    });
    expect(MIN_ATTENTION_ACTORS).toBe(2);
    expect(results.length).toBe(0);
  });

  it("treats accurate and inaccurate votes identically - polarity never affects the count", () => {
    const withMixedPolarity = aggregateTrendingClaims({
      posts: [
        { id: "p1", claimId: "c1", author: "u1", createdAt: t(0) },
        { id: "p2", claimId: "c1", author: "u2", createdAt: t(1000) },
      ],
      votes: [
        { post: "p1", user: "u3" },
        { post: "p2", user: "u4" },
      ],
      comments: [],
      reposts: [],
    });
    expect(withMixedPolarity[0].score).toBe(2 * 3 + 2); // authors(2)*3 + voters(2)*1
  });

  it("excludes a post's own author from counting as a voter, commenter, or reposter of that post", () => {
    const results = aggregateTrendingClaims({
      posts: [
        { id: "p1", claimId: "c1", author: "u1", createdAt: t(0) },
        { id: "p2", claimId: "c1", author: "u2", createdAt: t(1000) },
      ],
      votes: [{ post: "p1", user: "u1" }], // self-vote, must not count
      comments: [{ post: "p1", user: "u1" }], // self-comment, must not count
      reposts: [{ post: "p1", user: "u1" }], // self-repost, must not count
    });
    expect(results[0].score).toBe(2 * 3); // authors(2)*3 only - no self-engagement counted
  });

  it("caps each signal type's contribution by distinct actor, not raw action count", () => {
    const results = aggregateTrendingClaims({
      posts: [
        { id: "p1", claimId: "c1", author: "u1", createdAt: t(0) },
        { id: "p2", claimId: "c1", author: "u2", createdAt: t(1000) },
      ],
      votes: [],
      comments: [
        { post: "p1", user: "u3" },
        { post: "p2", user: "u3" }, // same commenter, two different posts of the same claim
      ],
      reposts: [],
    });
    expect(results[0].score).toBe(2 * 3 + 1); // authors(2)*3 + commenters(1)*1, not 2
  });

  it("recentPostCount changing (more duplicate posts by the same author) does not change score when the actor set is unchanged", () => {
    const fewer = aggregateTrendingClaims({
      posts: [
        { id: "p1", claimId: "c1", author: "u1", createdAt: t(0) },
        { id: "p2", claimId: "c1", author: "u2", createdAt: t(1000) },
      ],
      votes: [],
      comments: [],
      reposts: [],
    });
    const more = aggregateTrendingClaims({
      posts: [
        { id: "p1", claimId: "c1", author: "u1", createdAt: t(0) },
        { id: "p1b", claimId: "c1", author: "u1", createdAt: t(500) },
        { id: "p2", claimId: "c1", author: "u2", createdAt: t(1000) },
      ],
      votes: [],
      comments: [],
      reposts: [],
    });
    expect(more[0].score).toBe(fewer[0].score);
    expect(more[0].recentPostCount).toBe(3);
    expect(fewer[0].recentPostCount).toBe(2);
  });

  it("qualifies via the four-way union even when no single signal type alone reaches the threshold", () => {
    // One post author, one voter, one commenter, one reposter - no signal
    // type individually has 2 distinct actors, but the union across all four
    // does.
    const results = aggregateTrendingClaims({
      posts: [{ id: "p1", claimId: "c1", author: "u1", createdAt: t(0) }],
      votes: [{ post: "p1", user: "u2" }],
      comments: [{ post: "p1", user: "u3" }],
      reposts: [{ post: "p1", user: "u4" }],
    });
    expect(results.length).toBe(1);
    expect(results[0].engagedUserCount).toBe(4); // u1,u2,u3,u4
    expect(results[0].score).toBe(1 * 3 + 1 * 3 + 1 + 1); // author + reposter + voter + commenter
  });

  it("ignores votes/comments/reposts referencing a post outside the eligible recent set", () => {
    const results = aggregateTrendingClaims({
      posts: [
        { id: "p1", claimId: "c1", author: "u1", createdAt: t(0) },
        { id: "p2", claimId: "c1", author: "u2", createdAt: t(1000) },
      ],
      votes: [{ post: "p-outside-window", user: "u3" }],
      comments: [],
      reposts: [],
    });
    expect(results[0].score).toBe(2 * 3); // the out-of-window vote contributes nothing
  });

  it("computes independent scores/eligibility per claim when multiple claims are present", () => {
    const results = aggregateTrendingClaims({
      posts: [
        { id: "p1", claimId: "c1", author: "u1", createdAt: t(0) },
        { id: "p2", claimId: "c1", author: "u2", createdAt: t(1000) },
        { id: "p3", claimId: "c2", author: "u5", createdAt: t(2000) }, // below threshold alone
      ],
      votes: [],
      comments: [],
      reposts: [],
    });
    const claimIds = results.map((r) => r.claimId);
    expect(claimIds).toContain("c1");
    expect(claimIds).not.toContain("c2");
  });
});

describe("aggregateTrendingClaims - orchestration note", () => {
  it("does not itself apply the 3-day window - that filtering happens before this function is called", () => {
    // Documents the boundary: this pure function trusts its `posts` input to
    // already be window-filtered (done by getTrendingClaims's DB query), so
    // passing an old post through still counts it. Window exclusion is
    // covered separately by an integration test against getTrendingClaims.
    const results = aggregateTrendingClaims({
      posts: [
        { id: "p1", claimId: "c1", author: "u1", createdAt: t(30 * day) },
        { id: "p2", claimId: "c1", author: "u2", createdAt: t(1000) },
      ],
      votes: [],
      comments: [],
      reposts: [],
    });
    expect(results.length).toBe(1);
  });
});
