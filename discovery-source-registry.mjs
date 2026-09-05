import { scannerReadiness, videoScannerReadiness } from "./scanner.mjs";

// This registry is deliberately allow-list only. Adding an entry does not enable
// a source: the source must have a documented access route and the corresponding
// configuration approvals before it can return customer data.
export const DISCOVERY_SOURCES = Object.freeze([
  {
    id: "tineye-still-image",
    name: "TinEye — still-image search",
    kind: "reverse-image-provider",
    access: "official-api",
    dataClass: "creator-reference-image",
    requires: [
      "provider-key",
      "data-protection-and-transfer-review",
      "lawful-adult-content-confirmation",
    ],
  },
  {
    id: "tineye-video-keyframes",
    name: "TinEye — derived video keyframes",
    kind: "reverse-image-provider",
    access: "official-api",
    dataClass: "derived-video-frame",
    requires: [
      "provider-key",
      "data-protection-and-transfer-review",
      "lawful-adult-content-confirmation",
      "video-frame-vendor-and-privacy-approval",
    ],
  },
]);

function sourceStatus(source, environment) {
  const still = scannerReadiness(environment);
  const video = videoScannerReadiness(environment);
  const readiness = source.id === "tineye-video-keyframes" ? video : still;
  return {
    ...source,
    enabled: readiness.ready,
    status: readiness.ready ? "approved" : "blocked",
    missingApprovals: readiness.missingApprovals,
  };
}

export function discoverySourceRegistry(environment = process.env) {
  return DISCOVERY_SOURCES.map((source) => sourceStatus(source, environment));
}

export function discoverySourceSummary(environment = process.env) {
  const sources = discoverySourceRegistry(environment);
  const enabled = sources.filter((source) => source.enabled);
  return {
    total: sources.length,
    enabled: enabled.length,
    blocked: sources.length - enabled.length,
    sources,
  };
}
