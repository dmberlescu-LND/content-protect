import assert from "node:assert/strict";
import fs from "node:fs";

const pack = fs.readFileSync(
  new URL("../docs/compliance/PILOT-CREATOR-ADMISSION-PACK-DRAFT.md", import.meta.url),
  "utf8",
);

for (const required of [
  "**Status:** draft",
  "free, non-commercial first pilot",
  "I confirm that I own the submitted reference material",
  "I explicitly consent to Content Protect processing each reference file",
  "I understand that a prepared notice must show the recipient",
  "No external notice will be delivered",
  "No TinEye or other provider transmission",
  "No live notice delivery, no automatic takedown",
  "withdraw consent",
  "request deletion",
  "DPIA status is approved",
]) {
  assert.match(pack, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

console.log("Pilot admission pack guard: passed");
