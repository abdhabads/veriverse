import { execSync } from "child_process";

export default async function globalSetup() {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
}
