export const PAGE_CAPTURE_ASSET_STATUS = "Evidence capture";

export class PageCaptureError extends Error {
  constructor(message) {
    super(message);
    this.name = "PageCaptureError";
    this.status = 409;
  }
}

function validTimestamp(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function publicSource(value) {
  try {
    const url = new URL(String(value || ""));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname
    )
      return null;
    url.hash = "";
    return { url: url.href, host: url.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

export function pageCaptureMetadata({
  asset,
  match,
  consentVersion,
  capturedAt = new Date().toISOString(),
}) {
  const timestamp = validTimestamp(capturedAt),
    source = publicSource(match?.sourceUrl);
  if (
    !asset?.id ||
    asset.userId !== match?.userId ||
    asset.status !== PAGE_CAPTURE_ASSET_STATUS ||
    !String(asset.mime || "").startsWith("image/") ||
    !/^[a-f0-9]{64}$/.test(asset.checksum || "") ||
    !source ||
    source.host !== String(match?.site || "").toLowerCase() ||
    !timestamp ||
    !/^\d{4}-\d{2}-\d{2}-v\d+$/.test(String(consentVersion || ""))
  )
    throw new PageCaptureError("The page-capture evidence is invalid.");
  return {
    assetId: asset.id,
    sourceUrl: source.url,
    sourceHost: source.host,
    checksumSha256: asset.checksum,
    mime: asset.mime,
    byteSize: asset.size,
    width: asset.width || null,
    height: asset.height || null,
    capturedAt: timestamp,
    consentVersion,
    attestedTargetPage: true,
    attestedUnaltered: true,
  };
}

export function pageCaptureSnapshot(match, assets, userId) {
  const capture = match?.evidence?.pageCapture,
    source = publicSource(match?.sourceUrl),
    asset = (assets || []).find(
      (item) =>
        item.id === capture?.assetId &&
        item.userId === userId &&
        item.status === PAGE_CAPTURE_ASSET_STATUS,
    );
  if (
    !asset ||
    !source ||
    match.userId !== userId ||
    capture.sourceUrl !== source.url ||
    capture.sourceHost !== source.host ||
    source.host !== String(match.site || "").toLowerCase() ||
    capture.checksumSha256 !== asset.checksum ||
    capture.mime !== asset.mime ||
    capture.byteSize !== asset.size ||
    capture.attestedTargetPage !== true ||
    capture.attestedUnaltered !== true ||
    !validTimestamp(capture.capturedAt) ||
    !/^\d{4}-\d{2}-\d{2}-v\d+$/.test(capture.consentVersion || "")
  )
    return null;
  return {
    assetId: asset.id,
    sourceUrl: capture.sourceUrl,
    sourceHost: capture.sourceHost,
    checksumSha256: capture.checksumSha256,
    mime: capture.mime,
    byteSize: capture.byteSize,
    width: capture.width || null,
    height: capture.height || null,
    capturedAt: validTimestamp(capture.capturedAt),
    consentVersion: capture.consentVersion,
    attestedTargetPage: true,
    attestedUnaltered: true,
  };
}

export function referenceAssets(assets, userId) {
  return (assets || []).filter(
    (item) =>
      item.userId === userId && item.status !== PAGE_CAPTURE_ASSET_STATUS,
  );
}

export function mergeProviderEvidence(existingEvidence, providerEvidence) {
  return {
    ...(providerEvidence || {}),
    ...(existingEvidence?.pageCapture
      ? { pageCapture: existingEvidence.pageCapture }
      : {}),
  };
}
