import sharp from "sharp";

const TINEYE_ENDPOINT =
  process.env.TINEYE_API_URL || "https://api.tineye.com/rest/search/";

const TINEYE_HOST = "api.tineye.com";

export function scannerReadiness(environment = process.env) {
  const hasApiKey = Boolean(environment.TINEYE_API_KEY?.trim());
  const hasDataProtectionApproval = Boolean(
    environment.TINEYE_DATA_PROTECTION_APPROVAL_REFERENCE?.trim(),
  );
  const hasAdultContentApproval = Boolean(
    environment.TINEYE_ADULT_CONTENT_APPROVAL_REFERENCE?.trim(),
  );
  const missingApprovals = [
    !hasDataProtectionApproval && "data-protection-and-transfer-review",
    !hasAdultContentApproval && "lawful-adult-content-confirmation",
  ].filter(Boolean);
  return {
    ready: hasApiKey && missingApprovals.length === 0,
    mode: !hasApiKey
      ? "unconfigured"
      : missingApprovals.length
        ? "compliance-blocked"
        : "tineye-commercial",
    hasApiKey,
    hasDataProtectionApproval,
    hasAdultContentApproval,
    missingApprovals,
  };
}

export function scannerMode(environment = process.env) {
  return scannerReadiness(environment).mode;
}

export class ScanProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ScanProviderError";
    this.status = status;
  }
}

export async function prepareImageForProvider(image) {
  let output = await sharp(image)
    .rotate()
    .resize({
      width: 1200,
      height: 1200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  if (output.length > 1_000_000)
    output = await sharp(image)
      .rotate()
      .resize({
        width: 900,
        height: 900,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
  if (output.length > 1_000_000)
    throw new ScanProviderError(
      "The reference image could not be prepared within provider limits.",
      422,
    );
  return output;
}

function safeWebUrl(value) {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function normalizedHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

function hostIsOwned(host, ownedHosts) {
  const candidate = normalizedHost(host);
  return ownedHosts.some(
    (owned) => candidate === owned || candidate.endsWith(`.${owned}`),
  );
}

export async function searchImage(
  image,
  {
    assetId,
    allowedHosts = [],
    fetchImpl = fetch,
    apiKey = process.env.TINEYE_API_KEY,
    endpoint = TINEYE_ENDPOINT,
  },
) {
  if (!apiKey?.trim())
    throw new ScanProviderError(
      "Commercial image scanning is awaiting provider activation.",
      503,
    );
  const providerUrl = safeWebUrl(endpoint);
  if (
    !providerUrl ||
    providerUrl.protocol !== "https:" ||
    providerUrl.hostname !== TINEYE_HOST ||
    providerUrl.port ||
    providerUrl.pathname !== "/rest/search/" ||
    providerUrl.search
  )
    throw new ScanProviderError("The scan provider endpoint is invalid.", 500);
  const prepared = await prepareImageForProvider(image),
    form = new FormData();
  form.append(
    "image_upload",
    new Blob([prepared], { type: "image/jpeg" }),
    "reference.jpg",
  );
  form.append("offset", "0");
  form.append("limit", "100");
  form.append("backlink_limit", "100");
  form.append("sort", "score");
  form.append("order", "desc");
  let response;
  try {
    response = await fetchImpl(providerUrl, {
      method: "POST",
      headers: {
        "x-api-key": apiKey.trim(),
        "user-agent": "Content-Protect/1.0",
      },
      body: form,
      signal: AbortSignal.timeout(70_000),
    });
  } catch (error) {
    throw new ScanProviderError(
      error?.name === "TimeoutError"
        ? "The scan provider timed out. Try again shortly."
        : "The scan provider is temporarily unreachable.",
      503,
    );
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ScanProviderError(
      "The scan provider returned an invalid response.",
      502,
    );
  }
  if (!response.ok || payload.code !== 200) {
    const status = response.status === 402 ? 503 : response.status;
    throw new ScanProviderError(
      response.status === 402
        ? "The commercial scan allowance is exhausted."
        : response.status === 429
          ? "The scan provider is busy. Try again shortly."
          : "The scan provider could not process this image.",
      status >= 400 && status < 600 ? status : 502,
    );
  }
  const excluded = [
    "content-protect.com",
    "www.content-protect.com",
    ...allowedHosts,
  ]
    .map(normalizedHost)
    .filter(Boolean);
  const found = new Map();
  for (const match of payload.results?.matches || []) {
    const queryMatchPercent = Number(match.query_match_percent);
    if (Number.isFinite(queryMatchPercent) && queryMatchPercent < 5) continue;
    for (const backlink of match.backlinks || []) {
      const page = safeWebUrl(backlink.backlink);
      if (!page || hostIsOwned(page.hostname, excluded)) continue;
      const key = page.href;
      const candidate = {
        assetId,
        sourceUrl: page.href,
        sourceHost: page.hostname.toLowerCase(),
        mediaType: "Image",
        matchScore: Math.max(0, Math.min(100, Number(match.score) || 0)),
        evidence: {
          provider: "tineye",
          imageUrl: safeWebUrl(backlink.url)?.href || null,
          crawlDate: backlink.crawl_date || null,
          providerDomain: match.domain || null,
          queryHash: match.query_hash || null,
          queryMatchPercent: Number.isFinite(queryMatchPercent)
            ? Math.max(0, Math.min(100, queryMatchPercent))
            : null,
          tags: Array.isArray(match.tags)
            ? match.tags.filter((tag) => typeof tag === "string").slice(0, 10)
            : [],
        },
      };
      if (!found.has(key) || found.get(key).matchScore < candidate.matchScore)
        found.set(key, candidate);
    }
  }
  return {
    matches: [...found.values()],
    providerStats: payload.stats || {},
  };
}
