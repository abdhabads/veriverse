import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import Post from "@/models/Post";
import User from "@/models/User";

dotenv.config({ path: ".env.test.local" });

const EVIDENCE_POST_CONTENT =
  "The bridge on Main Street reopened after repairs, per city records.";

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  // prepareTestDb wipes all posts, so the evidence-seeded post must be
  // re-created after it runs, for every test in this file.
  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  const author = await User.findOne({ email: "usera@test.com" });
  if (author) {
    await Post.create({
      author: author._id,
      content: EVIDENCE_POST_CONTENT,
      status: "verified",
      aiLabel: "safe",
      verificationScore: 0.7,
      groundingStatus: "checked",
      groundingSummary: "An older, less explainable summary that should be overridden.",
      groundingSources: [
        {
          title: "City Records Office",
          url: "https://example.com/city-records",
          domain: "example.com",
          stance: "supports",
        },
      ],
      groundingConfidence: 70,
      contradictionCount: 0,
      supportCount: 1,
      evidenceAssessment: {
        supportStrength: "moderate",
        contradictionStrength: "none",
        independentSupportingCount: 1,
        independentContradictingCount: 0,
        supportWeight: 0.39,
        contradictionWeight: 0,
        explanation: "Moderate support: 1 independent source confirms the bridge reopened.",
      },
      contentType: "claim",
    });
  }
  await mongoose.disconnect();
  await request.get("/api/logout").catch(() => null);
});

test("evidence disclosure is collapsed by default and toggles aria-expanded", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  const card = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: EVIDENCE_POST_CONTENT })
    .first();
  // Generous timeout: this is often the first hit on /feed in a fresh dev
  // server run, which includes Next.js's on-demand compilation delay.
  await expect(card).toBeVisible({ timeout: 30_000 });

  const toggle = card.getByRole("button", { name: /why this assessment/i });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // Collapsed by default: the explanation text is not yet in the DOM.
  await expect(
    card.getByText("Moderate support: 1 independent source confirms the bridge reopened.")
  ).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // Prefers evidenceAssessment.explanation over the older groundingSummary.
  await expect(
    card.getByText("Moderate support: 1 independent source confirms the bridge reopened.")
  ).toBeVisible();
  await expect(
    card.getByText("An older, less explainable summary that should be overridden.")
  ).toHaveCount(0);

  // Source link remains intact and accessible.
  const sourceLink = card.getByRole("link", { name: /city records office/i });
  await expect(sourceLink).toBeVisible();
  await expect(sourceLink).toHaveAttribute("href", "https://example.com/city-records");

  // Independent counts are shown, not raw supportCount/contradictionCount
  // duplicated a second time, and no raw risk/verification line is present.
  await expect(card.getByText(/Supports:\s*1/)).toBeVisible();
  await expect(card.getByText(/Confidence:\s*70%/)).toBeVisible();
  await expect(card).not.toContainText("Risk");
  await expect(card).not.toContainText("verification confidence");

  // Same control collapses it again.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("legacy post with no evidence data still renders the card and toggle safely", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  // Seeded posts (prepareTestDb.ts) carry no groundingSummary/evidenceAssessment
  // at all - this is the "legacy/incomplete trust data" case.
  const card = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: "The local clinic opens at 8am tomorrow." })
    .first();
  await expect(card).toBeVisible({ timeout: 10_000 });

  const toggle = card.getByRole("button", { name: /why this assessment/i });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // No crash, no leftover raw risk/verification line.
  await expect(card).not.toContainText("Risk");
  await expect(card).not.toContainText("verification confidence");
});
