import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");

assert.match(
  source,
  /data\.entitlements\.trialPlan/,
  "dashboard must read the active trial entitlement",
);
assert.match(
  source,
  /trialPlan\s*\n\s*\? `\$\{data\.entitlements\.trialPlan\} \$\{trialLabel\}`/,
  "dashboard must label an active trial instead of showing the paid-plan fallback",
);

console.log(JSON.stringify({ ok: true, trialPlanLabel: true }));
