import assert from "node:assert/strict";
import sharp from "sharp";
import { ScanProviderError, searchImage } from "../scanner.mjs";

const image = await sharp({
  create: { width: 320, height: 240, channels: 3, background: "#7659e8" },
})
  .png()
  .toBuffer();

let request;
const result = await searchImage(image, {
  assetId: "asset-1",
  apiKey: "test-key",
  allowedHosts: ["creator.example"],
  fetchImpl: async (url, options) => {
    request = { url, options };
    return new Response(
      JSON.stringify({
        code: 200,
        stats: { total_backlinks: 4 },
        results: {
          matches: [
            {
              score: 72.4,
              domain: "stolen.example",
              query_hash: "query-hash",
              query_match_percent: 8.2,
              tags: ["stock"],
              backlinks: [
                {
                  backlink: "https://stolen.example/post#fragment",
                  url: "https://cdn.stolen.example/image.jpg",
                  crawl_date: "2026-07-01",
                },
                { backlink: "https://sub.creator.example/owned" },
                { backlink: "https://content-protect.com/owned" },
                { backlink: "javascript:alert(1)" },
              ],
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  },
});

assert.equal(request.url.href, "https://api.tineye.com/rest/search/");
assert.equal(request.options.headers["x-api-key"], "test-key");
assert.equal(result.matches.length, 1);
assert.equal(result.matches[0].sourceUrl, "https://stolen.example/post");
assert.equal(result.matches[0].confidence, 72.4);
assert.equal(result.matches[0].evidence.queryMatchPercent, 8.2);
assert.deepEqual(result.matches[0].evidence.tags, ["stock"]);
assert.equal(result.providerStats.total_backlinks, 4);

await assert.rejects(
  searchImage(image, {
    assetId: "asset-1",
    apiKey: "test-key",
    endpoint: "http://api.tineye.example/search",
  }),
  (error) => error instanceof ScanProviderError && error.status === 500,
);

await assert.rejects(
  searchImage(image, {
    assetId: "asset-1",
    apiKey: "test-key",
    fetchImpl: async () => {
      throw new DOMException("timed out", "TimeoutError");
    },
  }),
  (error) =>
    error instanceof ScanProviderError &&
    error.status === 503 &&
    error.message.includes("timed out"),
);

await assert.rejects(
  searchImage(image, {
    assetId: "asset-1",
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({ code: 402 }), { status: 402 }),
  }),
  (error) =>
    error instanceof ScanProviderError &&
    error.status === 503 &&
    error.message.includes("allowance"),
);

console.log(
  JSON.stringify({
    ok: true,
    provider: "tineye-commercial",
    ownedDomainFiltering: true,
    metadataPreserved: true,
    errorMapping: true,
  }),
);
