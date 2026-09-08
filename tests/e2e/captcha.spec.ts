import { test, expect, request as playwrightRequest } from "@playwright/test";

// This suite runs against the shared e2e webServer (CAPTCHA_ENABLED=false,
// no NEXT_PUBLIC_CAPTCHA_SITE_KEY configured - see playwright.config.ts).
// That is intentional: it is the same environment every other e2e spec
// relies on, so these tests must not require changing it. Tests that
// specifically need a configured site key to exercise the live widget are
// marked to skip with a clear reason when the key isn't present, rather
// than silently passing or requiring a second, differently-configured
// server just for this feature.

test.describe("CAPTCHA - user-facing placeholder removal", () => {
  test("login page never shows 'Captcha Token' or 'human-verified'", async ({ page }) => {
    await page.goto("/login");
    await page.waitForSelector('input[type="email"]', { state: "visible" });
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Captcha Token");
    expect(body).not.toContain("human-verified");
  });

  test("register page never shows 'Captcha Token' or 'human-verified'", async ({ page }) => {
    await page.goto("/register");
    await page.waitForSelector("#register-username", { state: "visible" });
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Captcha Token");
    expect(body).not.toContain("human-verified");
    // The old implementation also had a raw text input for the token -
    // confirm no such field exists under any id.
    expect(await page.locator("#register-captcha-token").count()).toBe(0);
    expect(await page.locator("#login-captcha-token").count()).toBe(0);
  });
});

test.describe("CAPTCHA - API behavior when disabled (current shared e2e config)", () => {
  test("login succeeds with no captchaToken field sent at all", async ({ baseURL }) => {
    const api = await playwrightRequest.newContext({ baseURL });
    const response = await api.post("/api/login", {
      data: { email: "usera@test.com", password: "Password123!" },
    });
    expect(response.ok()).toBeTruthy();
  });

  test("register rejects on other grounds but never on missing captchaToken", async ({ baseURL }) => {
    const api = await playwrightRequest.newContext({ baseURL });
    const response = await api.post("/api/register", {
      data: {
        // Deliberately invalid email so this fails for a REASON UNRELATED to
        // captcha - proves captcha isn't the blocker when disabled.
        username: `capt_${Date.now()}`,
        email: "not-an-email",
        password: "Password123!",
        agreedToTerms: true,
      },
    });
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(String(json.message || "")).not.toMatch(/captcha/i);
  });
});

test.describe("CAPTCHA - live Turnstile widget behavior (requires NEXT_PUBLIC_CAPTCHA_SITE_KEY)", () => {
  test.beforeEach(async ({ page }) => {
    // Mock Cloudflare's script so this never depends on real network access
    // or real Cloudflare test keys - deterministic and offline-safe.
    await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js", (route) => {
      route.fulfill({
        contentType: "application/javascript",
        body: `
          window.turnstile = {
            render: (container, options) => {
              const id = "mock-widget";
              window.__turnstileOptions = options;
              // Deliberately delayed (not near-instant) so the "disabled
              // before a token exists" state is reliably observable by the
              // assertions below, instead of racing a near-zero-delay mock.
              setTimeout(() => options.callback && options.callback("mock-token-1"), 400);
              return id;
            },
            reset: (id) => {
              const options = window.__turnstileOptions;
              setTimeout(() => options && options.callback && options.callback("mock-token-2"), 400);
            },
            remove: () => {},
          };
        `,
      });
    });
  });

  test("widget renders and gates submission until a token arrives", async ({ page }) => {
    await page.goto("/login");
    await page.waitForSelector('input[type="email"]', { state: "visible" });

    const widgetConfigured = (await page.locator('[data-testid="turnstile-widget"]').count()) > 0;
    test.skip(
      !widgetConfigured,
      "NEXT_PUBLIC_CAPTCHA_SITE_KEY is not configured in this environment - widget does not render, nothing to test here."
    );

    const loginButton = page.getByRole("button", { name: /login|complete verification/i });
    // Before the mocked token arrives, submission must be blocked.
    await expect(loginButton).toBeDisabled();

    // After the mocked callback fires, a token is available and submission
    // is allowed.
    await expect(loginButton).toBeEnabled({ timeout: 2000 });
    await expect(loginButton).toHaveText(/login/i);
  });

  test("a failed login attempt clears the token and a fresh one can be obtained without reloading", async ({ page }) => {
    await page.goto("/login");
    await page.waitForSelector('input[type="email"]', { state: "visible" });

    const widgetConfigured = (await page.locator('[data-testid="turnstile-widget"]').count()) > 0;
    test.skip(!widgetConfigured, "NEXT_PUBLIC_CAPTCHA_SITE_KEY is not configured in this environment.");

    await page.getByLabel("Email").fill("usera@test.com");
    await page.getByLabel("Password").fill("WrongPassword!");

    const loginButton = page.getByRole("button", { name: /login|complete verification/i });
    await expect(loginButton).toBeEnabled({ timeout: 2000 });
    await loginButton.click();

    // Wrong password -> server rejects -> button must become disabled again
    // (token cleared) rather than staying clickable with a stale token...
    await expect(loginButton).toBeDisabled({ timeout: 5000 });
    // ...and then re-enable once the mocked reset() delivers a fresh token,
    // proving the user can retry without a page reload.
    await expect(loginButton).toBeEnabled({ timeout: 2000 });
  });
});
