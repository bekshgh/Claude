// Apply Prisma migrations only on production deploys.
// Preview deployments (every pushed branch) share the production database, so
// letting them migrate would change live data before the branch is merged.
import { execSync } from "node:child_process";

if (process.env.VERCEL_ENV === "production") {
  execSync("prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log(`[migrate] VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}: skipping prisma migrate deploy`);
}
