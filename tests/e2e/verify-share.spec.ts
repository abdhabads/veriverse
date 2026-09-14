import { test, expect } from "@playwright/test";
import { MAX_SHARE_TEXT_LENGTH, MAX_SHARE_URL_LENGTH } from "@/lib/shareToVeriVerseLink";

// ---------------------------------------------------------------------------
// PART 1: manifest / share_target validity
// ---------------------------------------------------------------------------

test("the web manifest is valid and declares a safe, GET-based share_target", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = await res.json();

  expect(manifest.name).toBe("VeriVerse");
  expect(Array.isArray(manifest.icons)).toBe(true);
  expect(manifest.icons.length).toBeGreaterThan(0);

  expect(manifest.share_target.action).toBe("/verify");
  expect(String(manifest.share_target.method).toUpperCase()).toBe("GET");
  expect(manifest.share_target.params).toEqual({ title: "title", text: "text", url: "url" });
});

// ---------------------------------------------------------------------------
// PART 2: deep-link initialization - no auto-submit
// ---------------------------------------------------------------------------

test("a text deep link pre-fills Text mode and shows the shared banner, without calling the API", async ({
  page,
}) => {
  let verifyCallCount = 0;
  await page.route("**/api/verify", (route) => {
    verifyCallCount++;
    route.continue();
  });

  await page.goto("/verify?text=" + encodeURIComponent("The sky is blue."));

  await expect(page.getByTestId("verify-shared-banner")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Shared with VeriVerse")).toBeVisible();

  const textarea = page.getByLabel("Text to verify");
  await expect(textarea).toHaveValue("The sky is blue.");

  // Text mode must be the active tab (Text tab shows the primary button style).
  await expect(page.getByRole("tab", { name: "Text" })).toHaveAttribute("aria-selected", "true");

  // Give the page a moment to prove nothing fires on its own.
  await page.waitForTimeout(1000);
  expect(verifyCallCount).toBe(0);
});

test("a URL deep link pre-fills URL mode, without calling the API", async ({ page }) => {
  let verifyCallCount = 0;
  await page.route("**/api/verify", (route) => {
    verifyCallCount++;
    route.continue();
  });

  await page.goto("/verify?url=" + encodeURIComponent("https://example.com/article"));

  await expect(page.getByRole("tab", { name: "URL" })).toHaveAttribute("aria-selected", "true", {
    timeout: 15_000,
  });
  const urlInput = page.getByLabel("Webpage URL to verify");
  await expect(urlInput).toHaveValue("https://example.com/article");

  await page.waitForTimeout(1000);
  expect(verifyCallCount).toBe(0);
});

test("text and url arriving together are both preserved, and switching modes never loses either", async ({
  page,
}) => {
  await page.goto(
    "/verify?text=" + encodeURIComponent("A specific claim") + "&url=" + encodeURIComponent("https://example.com/")
  );

  // Text takes initial-mode precedence when both are present.
  await expect(page.getByRole("tab", { name: "Text" })).toHaveAttribute("aria-selected", "true", {
    timeout: 15_000,
  });
  await expect(page.getByLabel("Text to verify")).toHaveValue("A specific claim");

  await page.getByRole("tab", { name: "URL" }).click();
  await expect(page.getByLabel("Webpage URL to verify")).toHaveValue("https://example.com/");

  await page.getByRole("tab", { name: "Text" }).click();
  await expect(page.getByLabel("Text to verify")).toHaveValue("A specific claim");
});

test("a shared title renders as plain, safe display context, never as HTML", async ({ page }) => {
  await page.goto(
    "/verify?url=" +
      encodeURIComponent("https://example.com/") +
      "&title=" +
      encodeURIComponent('<img src=x onerror="window.__xss=true">Example Title')
  );

  await expect(page.getByTestId("verify-shared-banner")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Shared from:/)).toContainText("<img src=x onerror=");
  // If the payload had been rendered as real HTML, the injected handler
  // would have set this global - it must never fire.
  const xssFired = await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss);
  expect(xssFired).toBeUndefined();
});

test("no /verify direct visit or mode switch ever triggers the API on its own", async ({ page }) => {
  let verifyCallCount = 0;
  await page.route("**/api/verify", (route) => {
    verifyCallCount++;
    route.continue();
  });

  await page.goto("/verify");
  await expect(page.getByRole("tab", { name: "Text" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "URL" }).click();
  await page.getByRole("tab", { name: "Text" }).click();

  await page.waitForTimeout(500);
  expect(verifyCallCount).toBe(0);
});

// ---------------------------------------------------------------------------
// PART 3: bounded/edge-case query params
// ---------------------------------------------------------------------------

test("an oversized shared text is truncated to the existing text limit, not rejected", async ({ page }) => {
  const longText = "a".repeat(MAX_SHARE_TEXT_LENGTH + 500);
  await page.goto("/verify?text=" + encodeURIComponent(longText));

  // toHaveValue polls until the effect has actually populated the field -
  // toBeVisible alone is true from the very first render (the textarea
  // exists regardless of content) and would race the state update.
  const textarea = page.getByLabel("Text to verify");
  await expect(textarea).toHaveValue("a".repeat(MAX_SHARE_TEXT_LENGTH), { timeout: 15_000 });
});

test("an oversized shared url is truncated rather than crashing the page", async ({ page }) => {
  const longUrl = "https://example.com/" + "a".repeat(MAX_SHARE_URL_LENGTH);
  await page.goto("/verify?url=" + encodeURIComponent(longUrl));

  await expect(page.getByRole("tab", { name: "URL" })).toHaveAttribute("aria-selected", "true", {
    timeout: 15_000,
  });
  const urlInput = page.getByLabel("Webpage URL to verify");
  const value = await urlInput.inputValue();
  expect(value.length).toBeLessThanOrEqual(MAX_SHARE_URL_LENGTH);
});

test("a malformed url query param is preserved as-is, deferring validation to the Verify action", async ({
  page,
}) => {
  await page.goto("/verify?url=" + encodeURIComponent("not a valid url"));

  await expect(page.getByRole("tab", { name: "URL" })).toHaveAttribute("aria-selected", "true", {
    timeout: 15_000,
  });
  await expect(page.getByLabel("Webpage URL to verify")).toHaveValue("not a valid url");
});

test("whitespace-only shared text is treated as no share at all", async ({ page }) => {
  await page.goto("/verify?text=" + encodeURIComponent("   "));

  await expect(page.getByRole("tab", { name: "Text" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("verify-shared-banner")).toHaveCount(0);
  await expect(page.getByLabel("Text to verify")).toHaveValue("");
});

test("a plain visit with no query params behaves exactly as before P5.3", async ({ page }) => {
  await page.goto("/verify");

  await expect(page.getByRole("tab", { name: "Text" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("verify-shared-banner")).toHaveCount(0);
  await expect(page.getByLabel("Text to verify")).toHaveValue("");
});

// ---------------------------------------------------------------------------
// PART 4: Post isolation
// ---------------------------------------------------------------------------

test("no Post-related request is ever made by visiting a share deep link", async ({ page }) => {
  let postCallCount = 0;
  await page.route("**/api/posts", (route) => {
    postCallCount++;
    route.continue();
  });

  await page.goto("/verify?text=" + encodeURIComponent("Some shared claim text"));
  await expect(page.getByTestId("verify-shared-banner")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);

  expect(postCallCount).toBe(0);
});
