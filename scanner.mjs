import sharp from "sharp";

const TINEYE_ENDPOINT =
  process.env.TINEYE_API_URL || "https://api.tineye.com/rest/search/";

export function scannerMode() {
  return process.env.TINEYE_API_KEY ? "tineye-commercial" : "unconfigured";
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
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

export async function searchImage(image, { assetId, allowedHosts = [] }) {
  if (!process.env.TINEYE_API_KEY)
    throw new ScanProviderError(
      "Commercial image scanning is awaiting provider activation.",
      503,
    );
  const prepared = await prepareImageForProvider(image),
    form = new FormData();
  form.append(
    "image_upload",
    new Blob([prepared], { type: "image/jpeg" }),
    "reference.jpg",
  );
  form.append("offset", "0");
  form.append("limit", "100");
  form.append("sort", "score");
  form.append("order", "desc");
  const response = await fetch(TINEYE_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": process.env.TINEYE_API_KEY,
      "user-agent": "Content-Protect/1.0",
    },
    body: form,
    signal: AbortSignal.timeout(70_000),
  });
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
  const excluded = new Set([
    "content-protect.com",
    "www.content-protect.com",
    ...allowedHosts,
  ]);
  const found = new Map();
  for (const match of payload.results?.matches || []) {
    for (const backlink of match.backlinks || []) {
      const page = safeWebUrl(backlink.backlink);
      if (!page || excluded.has(page.hostname.toLowerCase())) continue;
      const key = page.href;
      const candidate = {
        assetId,
        sourceUrl: page.href,
        sourceHost: page.hostname.toLowerCase(),
        mediaType: "Image",
        confidence: Math.max(0, Math.min(100, Number(match.score) || 0)),
        evidence: {
          provider: "tineye",
          imageUrl: safeWebUrl(backlink.url)?.href || null,
          crawlDate: backlink.crawl_date || null,
          providerDomain: match.domain || null,
          queryHash: match.query_hash || null,
        },
      };
      if (!found.has(key) || found.get(key).confidence < candidate.confidence)
        found.set(key, candidate);
    }
  }
  return {
    matches: [...found.values()],
    providerStats: payload.stats || {},
  };
}
