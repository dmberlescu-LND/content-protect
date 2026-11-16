import assert from "node:assert/strict";
import fs from "node:fs";

const render = fs.readFileSync(new URL("../render.yaml", import.meta.url), "utf8");
const policy = fs.readFileSync(new URL("../pilot-policy.mjs", import.meta.url), "utf8");

assert.match(render, /key: CONTENT_PROTECT_PILOT_MODE\s+value: free/);
assert.match(render, /key: PAYMENTS_MODE\s+value: test/);
assert.match(render, /key: TAKEDOWNS_MODE\s+value: sandbox/);
assert.match(render, /key: YOTI_MODE\s+value: sandbox/);
assert.match(render, /key: BIOMETRICS_ENABLED\s+value: "false"/);
assert.match(policy, /FREE_PILOT/);
assert.match(policy, /\["scan", "billing", "notice-delivery"\]/);

console.log("Free pilot deployment guard: passed");
