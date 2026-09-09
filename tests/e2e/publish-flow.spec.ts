import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  await request.get("/api/logout").catch(() => null);
});

test("fast success: never shows the checking phase, reaches success, returns to idle", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  const composer = page.getByPlaceholder(/share something truthful/i);
  await composer.fill("Fast publish: the office reopens Monday.");

  const publishButton = page.getByTestId("publish-button");

  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/posts") && res.request().method() === "POST" && res.ok()
    ),
    publishButton.click(),
  ]);

  // "Checking..." should not have had a chance to appear for a fast local
  // response (well under the 1500ms threshold in this test environment).
  await expect(page.getByText("Checking claim against available evidence…")).toHaveCount(0);

  const newPost = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: "Fast publish: the office reopens Monday." })
    .first();
  await expect(newPost).toBeVisible();

  // Composer returns to idle: hashtag hint back, button enabled, textarea cleared.
  await expect(page.getByText("Use hashtags like #truth #health #politics")).toBeVisible();
  await expect(publishButton).toBeEnabled();
  await expect(composer).toHaveValue("");
});

test("slow success: transitions to checking, then to success, then idle", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  await page.route("**/api/posts", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 3500));
    }
    await route.continue();
  });

  const composer = page.getByPlaceholder(/share something truthful/i);
  await composer.fill("Slow publish: a new bus route starts next quarter.");

  const publishButton = page.getByTestId("publish-button");
  await publishButton.click();

  // Immediately: Publishing…
  await expect(page.getByText("Publishing…")).toBeVisible();

  // After the ~1500ms client timer, before the delayed response resolves at
  // ~3500ms - generous window to absorb dev-server timing jitter.
  await expect(page.getByText("Checking claim against available evidence…")).toBeVisible({
    timeout: 3000,
  });

  // Once the delayed response finally resolves: Published ✓, then idle.
  await expect(page.getByText("Published ✓")).toBeVisible({ timeout: 3000 });
  await expect(page.getByText("Use hashtags like #truth #health #politics")).toBeVisible({
    timeout: 3000,
  });
  await expect(publishButton).toBeEnabled();
});

test("early failure: fails before the checking timer, never shows success, becomes usable again", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  await page.route("**/api/posts", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "Simulated early failure" }),
      });
      return;
    }
    await route.continue();
  });

  const composer = page.getByPlaceholder(/share something truthful/i);
  await composer.fill("This attempt will fail early.");

  const publishButton = page.getByTestId("publish-button");
  await publishButton.click();

  await expect(page.getByText(/simulated early failure/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Published ✓")).toHaveCount(0);
  await expect(page.getByText("Checking claim against available evidence…")).toHaveCount(0);
  await expect(publishButton).toBeEnabled();

  // Content is preserved on failure (existing behavior - not cleared before success).
  await expect(composer).toHaveValue("This attempt will fail early.");
});

test("late failure: checking is already visible, then fails, progress clears, never shows success", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  await page.route("**/api/posts", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 3500));
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "Simulated late failure" }),
      });
      return;
    }
    await route.continue();
  });

  const composer = page.getByPlaceholder(/share something truthful/i);
  await composer.fill("This attempt will fail after checking appears.");

  const publishButton = page.getByTestId("publish-button");
  await publishButton.click();

  // Checking should appear ~1500ms after click, well before the 3500ms
  // delayed response - generous window to absorb dev-server timing jitter
  // without racing the response.
  await expect(page.getByText("Checking claim against available evidence…")).toBeVisible({
    timeout: 3000,
  });

  await expect(page.getByText(/simulated late failure/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Checking claim against available evidence…")).toHaveCount(0);
  await expect(page.getByText("Published ✓")).toHaveCount(0);
  await expect(publishButton).toBeEnabled();
});

test("regression: newly published post stays visible even if a refetch would omit it (P0.1)", async ({ page }) => {
  // Models the production failure: GET /api/posts sits behind a shared cache
  // that can briefly (or not-so-briefly) omit a just-created post. This test
  // proves the fix by request behavior - the app must not depend on any GET
  // after the POST at all, not merely happen to dodge a race in this run.
  await login(page, "usera@test.com", "Password123!");

  const SMOKE_CONTENT = "Regression publish visibility check: cache can go stale.";
  let postRequestCount = 0;

  // Just count POSTs for now - let every GET (including React Strict Mode's
  // dev-only duplicate mount fetch) pass through untouched.
  await page.route("**/api/posts", async (route) => {
    if (route.request().method() === "POST") {
      postRequestCount += 1;
    }
    await route.continue();
  });

  await page.goto("/feed");
  // Let the mount's fetch(es) fully settle - including Strict Mode's
  // duplicate-effect invocation in dev - before arming the post-publish
  // trap below, so a late-resolving mount request can't be mis-attributed
  // to publishing.
  await page.waitForLoadState("networkidle");

  const composer = page.getByPlaceholder(/share something truthful/i);
  await composer.fill(SMOKE_CONTENT);

  let getCountAfterArmed = 0;
  // Registered just before the click: Playwright matches a request against
  // the most recently registered matching handler at the time the request
  // is *initiated*, so any residual mount request already in flight is
  // unaffected - only requests the app initiates from this point on can be
  // caught here.
  await page.route("**/api/posts", async (route) => {
    if (route.request().method() !== "GET") {
      // Not ours to handle - fall back to the first handler above so the
      // POST still gets counted there instead of being swallowed here.
      await route.fallback();
      return;
    }
    // 3. Any GET made after arming is deliberately mocked to omit the new
    // post - simulating the stale shared-cache response that caused the
    // production bug. If the app ever refetches after publishing, this
    // would make the new post disappear again.
    getCountAfterArmed += 1;
    const response = await route.fetch();
    const json = await response.json();
    const filtered = {
      ...json,
      posts: (json.posts || []).filter(
        (p: any) => !String(p.content || "").includes(SMOKE_CONTENT)
      ),
    };
    await route.fulfill({
      status: response.status(),
      contentType: "application/json",
      body: JSON.stringify(filtered),
    });
  });

  const publishButton = page.getByTestId("publish-button");

  // 4. Click Publish.
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/posts") && res.request().method() === "POST" && res.ok()
    ),
    publishButton.click(),
  ]);

  const newPost = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: SMOKE_CONTENT })
    .first();

  // 5. The post returned by the POST becomes visible immediately.
  await expect(newPost).toBeVisible();

  // 6. It remains visible through the success phase and after returning to idle.
  await expect(page.getByText("Use hashtags like #truth #health #politics")).toBeVisible({
    timeout: 5000,
  });
  await expect(newPost).toBeVisible();

  // 7. Exactly one POST occurred.
  expect(postRequestCount).toBe(1);

  // 8. Publishing itself never triggered another GET /api/posts - proven by
  // request count, not merely by the post happening to still be visible.
  expect(getCountAfterArmed).toBe(0);
});

test("duplicate-submit protection: button is disabled while a publish is pending", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  let postRequestCount = 0;
  await page.route("**/api/posts", async (route) => {
    if (route.request().method() === "POST") {
      postRequestCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await route.continue();
  });

  const composer = page.getByPlaceholder(/share something truthful/i);
  await composer.fill("Only one of these should ever be sent.");

  const publishButton = page.getByTestId("publish-button");
  await publishButton.click();

  // Immediately disabled - a user cannot trigger a second submission from
  // the same composer while the first is pending.
  await expect(publishButton).toBeDisabled();

  await expect(page.getByText("Use hashtags like #truth #health #politics")).toBeVisible({
    timeout: 5000,
  });
  expect(postRequestCount).toBe(1);
});
