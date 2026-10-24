// npm run seed: reset the local database (DB_PATH) and fill it with synthetic demo patients.
import { createCtx } from "@/lib/state/db";
import { seedDemo } from "@/lib/state/seed";
import { staffState } from "@/lib/state/views";

async function main() {
  const ctx = createCtx();
  await seedDemo(ctx);
  const visits = staffState(ctx, "nurse", false, "seed-script").visits;
  console.log(`Seeded ${visits.length} synthetic patients into ${process.env.DB_PATH ?? "./care-loop.db"}`);
  for (const v of visits) console.log(`  ${v.displayId}  ${v.status}`);
  ctx.db.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
