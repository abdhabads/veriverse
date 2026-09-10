import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import AuditLog from "@/models/AuditLog";

dotenv.config({ path: ".env.test.local" });

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
});

test("a deactivated ordinary user can successfully restore their account", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const password = await bcrypt.hash("Password123!", 10);
  const deactivated = await User.create({
    username: "restoreme",
    email: "restoreme@test.com",
    password,
    role: "user",
    moderationStatus: "active",
    isDeactivated: true,
    deactivatedAt: new Date(Date.now() - 60 * 60 * 1000),
    deletionEligibleAt: new Date(Date.now() + 23 * 60 * 60 * 1000),
  });
  await mongoose.disconnect();

  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.post("/api/profile/account/restore", {
    data: { email: "restoreme@test.com", password: "Password123!" },
  });

  // Before the fix, this failed with a 500 from a Mongoose enum validation
  // error on the AuditLog write (actionType: "account_self_restored" was
  // not an accepted value), even though the restore itself was otherwise
  // valid and eligible.
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.success).toBe(true);

  await mongoose.connect(process.env.MONGO_URI!);
  const restored = await User.findById(deactivated._id);
  expect(restored!.isDeactivated).toBe(false);

  const auditRow = await AuditLog.findOne({
    actor: deactivated._id,
    actionType: "account_self_restored",
  });
  expect(auditRow).not.toBeNull();
  expect(auditRow!.actorRole).toBe("user");
  await mongoose.disconnect();

  await api.dispose();
});
