import { createRequire } from "node:module";

const rootRequire = createRequire(import.meta.url);

export const YOTI_SECURE_DEPENDENCY_MINIMUMS = Object.freeze({
  "form-data": "4.0.6",
  protobufjs: "8.5.1",
});

function numericVersion(value) {
  const match = String(value || "").match(/^(\d+)\.(\d+)\.(\d+)(?:-|$)/);
  return match ? match.slice(1).map(Number) : null;
}

export function versionAtLeast(actual, minimum) {
  const left = numericVersion(actual),
    right = numericVersion(minimum);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true;
    if (left[index] < right[index]) return false;
  }
  return true;
}

export function evaluateYotiDependencySecurity(versions) {
  const dependencies = Object.fromEntries(
      Object.entries(YOTI_SECURE_DEPENDENCY_MINIMUMS).map(([name, minimum]) => {
        const actual = String(versions?.[name] || "");
        return [
          name,
          { actual, minimum, secure: versionAtLeast(actual, minimum) },
        ];
      }),
    ),
    secure = Object.values(dependencies).every((item) => item.secure);
  return { secure, dependencies };
}

export function installedYotiDependencySecurity() {
  try {
    const yotiRequire = createRequire(rootRequire.resolve("yoti/package.json")),
      versions = Object.fromEntries(
        Object.keys(YOTI_SECURE_DEPENDENCY_MINIMUMS).map((name) => [
          name,
          yotiRequire(`${name}/package.json`).version,
        ]),
      );
    return evaluateYotiDependencySecurity(versions);
  } catch {
    return evaluateYotiDependencySecurity({});
  }
}
