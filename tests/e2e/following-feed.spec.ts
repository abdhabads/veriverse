import { execSync } from "child_process";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { login } from "./helpers";

const FOLLOWED_POST = "This miracle cure is 100% guaranteed!!!"; // userb, seeded
const UNFOLLOWED_POST = "Post from an author usera does not follow.";

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  await request.get("/api/logout").catch(() => null);
});

test("switching Discovery/Following reflects the follow graph, survives refresh, and still renders trust/evidence UI", async ({ page, baseURL }) => {
  // Fixture: an author usera will never follow, so its post can prove
  // Following mode actually excludes non-followed authors. Seeded via a
  // separate, throwaway API context rather than logging `page` itself in
  // and back out, so the page's own session is never touched by this setup.
  const apiC = await playwrightRequest.newContext({ baseURL });
  await apiC.post("/api/login", { data: { email: "expert@test.com", password: "Password123!" } });
  await apiC.post("/api/posts", { data: { content: UNFOLLOWED_POST } });
  await apiC.dispose();

  await login(page, "usera@test.com", "Password123!");
  const userbId = (await (await page.request.get("/api/users/userb")).json()).user._id;
  await page.request.post("/api/follow", { data: { targetUserId: userbId } });

  await page.goto("/feed");

  const discoveryTab = page.getByTestId("feed-mode-discovery");
  const followingTab = page.getByTestId("feed-mode-following");

  // Discovery is the default, global view: both posts are visible.
  await expect(discoveryTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator('[data-testid="post-card"]').filter({ hasText: FOLLOWED_POST })
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator('[data-testid="post-card"]').filter({ hasText: UNFOLLOWED_POST })
  ).toBeVisible();

  // Switch to Following.
  await followingTab.click();
  await expect(followingTab).toHaveAttribute("aria-selected", "true");

  const followedCard = page.locator('[data-testid="post-card"]').filter({ hasText: FOLLOWED_POST });
  await expect(followedCard).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator('[data-testid="post-card"]').filter({ hasText: UNFOLLOWED_POST })
  ).toHaveCount(0);

  // Trust/evidence UI still renders normally on a Following-mode card.
  await expect(followedCard.getByRole("button", { name: /why this assessment/i })).toBeVisible();

  // Reload directly via the URL Following mode should have written.
  await page.goto("/feed?mode=following");
  await expect(page.getByTestId("feed-mode-following")).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator('[data-testid="post-card"]').filter({ hasText: FOLLOWED_POST })
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator('[data-testid="post-card"]').filter({ hasText: UNFOLLOWED_POST })
  ).toHaveCount(0);

  // Switch back to Discovery.
  await page.getByTestId("feed-mode-discovery").click();
  await expect(page.getByTestId("feed-mode-discovery")).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator('[data-testid="post-card"]').filter({ hasText: UNFOLLOWED_POST })
  ).toBeVisible({ timeout: 15_000 });
});

test("Following empty state appears when following nobody, with a way back to Discovery", async ({ page }) => {
  await login(page, "admin@test.com", "Password123!");
  await page.goto("/feed");

  await page.getByTestId("feed-mode-following").click();
  await expect(page.getByText("Your Following feed is empty")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Back to Discovery" }).click();
  await expect(page.getByTestId("feed-mode-discovery")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Your Following feed is empty")).toHaveCount(0);
});

test("publishing while in Following mode shows the new post immediately, no reload", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");
  await page.getByTestId("feed-mode-following").click();
  await expect(page.getByTestId("feed-mode-following")).toHaveAttribute("aria-selected", "true");

  const content = `Following-mode publish check: ${Date.now()}`;
  const composer = page.getByPlaceholder(/share something truthful/i);
  await composer.fill(content);

  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/posts") && res.request().method() === "POST" && res.ok()
    ),
    page.getByTestId("publish-button").click(),
  ]);

  await expect(
    page.locator('[data-testid="post-card"]').filter({ hasText: content })
  ).toBeVisible();
});
