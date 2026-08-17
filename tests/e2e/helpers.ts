import { Page, expect } from "@playwright/test";

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");

  // Wait for the form to be interactive before filling
  await page.waitForSelector('input[type="email"]', { state: "visible" });

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);

  // Click and wait for navigation simultaneously - prevents race condition
  await Promise.all([
    page.waitForURL(/feed|admin|expert/, { timeout: 15_000 }),
    page.getByRole("button", { name: /login/i }).click(),
  ]);
}

export async function createPost(page: Page, content: string) {
  // Always navigate to feed first - createPost was missing this
  await page.goto("/feed");

  // Wait for the composer to be ready
  const postInput = page.getByPlaceholder(/share something truthful/i);
  await postInput.waitFor({ state: "visible", timeout: 10_000 });
  await postInput.fill(content);

  // Wait for the API response and the button click together
  await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes("/api/posts") &&
        res.request().method() === "POST",
      { timeout: 15_000 }
    ),
    page.getByRole("button", { name: /publish post|post/i }).click(),
  ]);

  // Give the feed a moment to re-render with the new post
  await page.waitForTimeout(1500);
}
