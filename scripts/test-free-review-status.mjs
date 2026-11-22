import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

for (const required of [
  'fetch("/api/support/cases")',
  '.filter((item) => item.category === "safety")',
  'createdAt || right.updatedAt',
  'setTrackedCase(latest)',
  'setTrackedCase(result.case || null)',
  'responseDue',
]) {
  assert.ok(source.includes(required), `missing expected free review marker: ${required}`);
}

console.log("Free review status persistence guard: passed");
