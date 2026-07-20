import assert from "node:assert/strict";
import {
  evaluateYotiDependencySecurity,
  installedYotiDependencySecurity,
  versionAtLeast,
} from "../yoti-dependency-security.mjs";

assert.equal(versionAtLeast("4.0.6", "4.0.6"), true);
assert.equal(versionAtLeast("4.1.0", "4.0.6"), true);
assert.equal(versionAtLeast("4.0.5", "4.0.6"), false);
assert.equal(versionAtLeast("not-a-version", "4.0.6"), false);
assert.equal(
  evaluateYotiDependencySecurity({
    "form-data": "4.0.6",
    protobufjs: "8.7.1",
  }).secure,
  true,
);
assert.equal(
  evaluateYotiDependencySecurity({
    "form-data": "4.0.4",
    protobufjs: "8.2.1",
  }).secure,
  false,
);

const installed = installedYotiDependencySecurity();
assert.equal(installed.secure, true);
assert.equal(installed.dependencies["form-data"].actual, "4.0.6");
assert.equal(installed.dependencies.protobufjs.actual, "8.7.1");

console.log(
  JSON.stringify({
    ok: true,
    installedPatchedSdkAccepted: true,
    minimumVersionsEnforced: true,
    malformedVersionsFailClosed: true,
  }),
);
