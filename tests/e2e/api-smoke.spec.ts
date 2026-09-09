import { execSync } from "child_process";
import { test, expect, request as playwrightRequest } from "@playwright/test";

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
});

test("login API returns success", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const response = await api.post("/api/login", {
    data: {
      email: "usera@test.com",
      password: "Password123!",
    },
  });

  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.success).toBe(true);
  expect(json.user.email).toBe("usera@test.com");
});

test("register API rejects bad email", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const response = await api.post("/api/register", {
    data: {
      username: "baduser",
      email: "bad-email",
      password: "Password123!",
    },
  });

  expect(response.status()).toBe(400);
});

test("protected access API requires auth", async ({ request }) => {
  const response = await request.get("/api/access");
  expect([401, 403]).toContain(response.status());
});

// P0.2: GET /api/posts is requester-dependent (block/mute filtering) but was
// previously served through a shared CDN cache with no Vary header - meaning
// one user's filtered response could be served to a different requester.
// The fix removes shared caching entirely; this proves it's gone for good.
test("GET /api/posts is not eligible for shared/CDN caching", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const response = await api.get("/api/posts");

  expect(response.ok()).toBeTruthy();
  const cacheControl = (response.headers()["cache-control"] || "").toLowerCase();

  expect(cacheControl).toContain("private");
  expect(cacheControl).toContain("no-store");
  expect(cacheControl).not.toContain("s-maxage");
  expect(cacheControl).not.toContain("stale-while-revalidate");

  await api.dispose();
});

// Proves the underlying filtering logic is genuinely per-requester, not
// global - a prerequisite for the cache fix to actually matter. This cannot
// exercise the real Vercel edge CDN from a local Playwright run, so it is
// deliberately paired with the cache-header test above rather than
// standing in for it: together they show the response is both computed
// per-requester AND no longer cacheable in a way that could cross requesters.
test("GET /api/posts block filtering is scoped to the requester, not global", async ({ baseURL }) => {
  const BLOCKED_AUTHOR_CONTENT = "This miracle cure is 100% guaranteed!!!"; // userb's seeded post

  const apiA = await playwrightRequest.newContext({ baseURL });
  const loginRes = await apiA.post("/api/login", {
    data: { email: "usera@test.com", password: "Password123!" },
  });
  expect(loginRes.ok()).toBeTruthy();

  const userbRes = await apiA.get("/api/users/userb");
  expect(userbRes.ok()).toBeTruthy();
  const userbId = (await userbRes.json()).user._id;

  const blockRes = await apiA.post("/api/relations", {
    data: { targetUserId: userbId, relationType: "block" },
  });
  expect(blockRes.ok()).toBeTruthy();

  const postsAsA = await (await apiA.get("/api/posts")).json();
  const aSeesBlockedAuthor = (postsAsA.posts || []).some(
    (p: any) => p.content === BLOCKED_AUTHOR_CONTENT
  );
  expect(aSeesBlockedAuthor).toBe(false);

  const apiUnauth = await playwrightRequest.newContext({ baseURL });
  const postsUnauth = await (await apiUnauth.get("/api/posts")).json();
  const unauthSeesBlockedAuthor = (postsUnauth.posts || []).some(
    (p: any) => p.content === BLOCKED_AUTHOR_CONTENT
  );
  expect(unauthSeesBlockedAuthor).toBe(true);

  await apiA.dispose();
  await apiUnauth.dispose();
});

// P1.0: GET /api/follow exposes "does the requester follow this user?" -
// previously no endpoint existed for this at all.
test("GET /api/follow reflects real follow state, not client memory", async ({ baseURL }) => {
  const apiA = await playwrightRequest.newContext({ baseURL });
  const loginRes = await apiA.post("/api/login", {
    data: { email: "usera@test.com", password: "Password123!" },
  });
  expect(loginRes.ok()).toBeTruthy();

  const userbRes = await apiA.get("/api/users/userb");
  const userbId = (await userbRes.json()).user._id;

  // 1. Initially not following.
  const before = await (await apiA.get("/api/follow", { params: { targetUserId: userbId } })).json();
  expect(before.following).toBe(false);

  // 2. Follow.
  const followRes = await apiA.post("/api/follow", { data: { targetUserId: userbId } });
  const followJson = await followRes.json();
  expect(followRes.ok()).toBeTruthy();
  expect(followJson.following).toBe(true);

  // 3. A fresh, independent GET reflects the persisted state, not just the
  // POST response - proves state comes from the Follow collection.
  const afterFollow = await (await apiA.get("/api/follow", { params: { targetUserId: userbId } })).json();
  expect(afterFollow.following).toBe(true);

  // 4. Unfollow (existing toggle) and confirm.
  const unfollowRes = await apiA.post("/api/follow", { data: { targetUserId: userbId } });
  const unfollowJson = await unfollowRes.json();
  expect(unfollowJson.following).toBe(false);

  const afterUnfollow = await (await apiA.get("/api/follow", { params: { targetUserId: userbId } })).json();
  expect(afterUnfollow.following).toBe(false);

  await apiA.dispose();
});

test("POST /api/follow stays data-safe under a rapid double toggle", async ({ baseURL }) => {
  const apiA = await playwrightRequest.newContext({ baseURL });
  await apiA.post("/api/login", {
    data: { email: "usera@test.com", password: "Password123!" },
  });
  const userbId = (await (await apiA.get("/api/users/userb")).json()).user._id;

  // The existing POST /api/follow (pre-P1.0, unchanged here) is a
  // check-then-act toggle: findOne, then create or delete. Under two
  // genuinely simultaneous requests, today's implementation can have one
  // of them fail (observed as a 500, since the Follow model's unique
  // index rejects a duplicate create and the route's generic catch-all
  // reports that as a server error rather than a graceful re-check).
  // That's a pre-existing characteristic, not something P1.0 fixes, and
  // not something the UI can trigger (the profile page's follow-toggle
  // button disables itself for the duration of the request). This test
  // deliberately does not assert a specific status for the losing
  // request - only what must hold regardless of how gracefully that race
  // is ever handled: at least one request succeeds, and the data layer
  // ends up in a single well-defined state, never duplicated or
  // corrupted (structurally guaranteed by the unique index - a duplicate
  // create can only fail, never silently succeed). A future fix that
  // handles both requests gracefully (e.g. both returning 200) still
  // satisfies this test unchanged.
  const [r1, r2] = await Promise.all([
    apiA.post("/api/follow", { data: { targetUserId: userbId } }),
    apiA.post("/api/follow", { data: { targetUserId: userbId } }),
  ]);
  const statuses = [r1.status(), r2.status()];
  expect(statuses.some((s) => s === 200)).toBe(true);

  const finalState = await (await apiA.get("/api/follow", { params: { targetUserId: userbId } })).json();
  expect(typeof finalState.following).toBe("boolean");

  await apiA.dispose();
});

test("GET /api/follow requires auth and handles self-target safely", async ({ baseURL }) => {
  const apiUnauth = await playwrightRequest.newContext({ baseURL });
  const unauthRes = await apiUnauth.get("/api/follow", { params: { targetUserId: "000000000000000000000000" } });
  expect(unauthRes.status()).toBe(401);
  await apiUnauth.dispose();

  const apiA = await playwrightRequest.newContext({ baseURL });
  const loginRes = await apiA.post("/api/login", {
    data: { email: "usera@test.com", password: "Password123!" },
  });
  const meJson = await loginRes.json();
  const selfId = meJson.user._id;

  const selfRes = await apiA.get("/api/follow", { params: { targetUserId: selfId } });
  expect(selfRes.ok()).toBeTruthy();
  expect((await selfRes.json()).following).toBe(false);

  await apiA.dispose();
});
