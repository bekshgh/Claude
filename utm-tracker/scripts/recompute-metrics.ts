// Recompute ProjectMetrics for every real project (after a formula change, bump
// METRICS_VERSION first).   npm run projects:recompute [-- --outdated]
import { PrismaClient } from "@prisma/client";
import { recomputeAll } from "../src/lib/projects/recompute";

const prisma = new PrismaClient();
recomputeAll(prisma, process.argv.includes("--outdated"))
  .then((n) => console.log(`recomputed ${n} project(s)`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
