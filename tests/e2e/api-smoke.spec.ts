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
