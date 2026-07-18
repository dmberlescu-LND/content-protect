const base = (process.env.APP_URL || "https://content-protect.com").replace(
  /\/$/,
  "",
);
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const get = (path) =>
  fetch(`${base}${path}`, {
    headers: { "user-agent": "Content-Protect-SEO-Verifier/1.0" },
  });

const homeResponse = await get("/");
const home = await homeResponse.text();
expect(homeResponse.ok, `homepage returned HTTP ${homeResponse.status}`);
expect(
  home.includes('<link rel="canonical" href="https://content-protect.com/"'),
  "homepage canonical is missing",
);
expect(home.includes('hreflang="en-GB"'), "en-GB hreflang is missing");
expect(home.includes('property="og:image"'), "Open Graph image is missing");
expect(home.includes('name="twitter:card" content="summary_large_image"'), "large Twitter card is missing");

const jsonLdMatch = home.match(
  /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
);
expect(Boolean(jsonLdMatch), "JSON-LD is missing");
if (jsonLdMatch) {
  try {
    const structured = JSON.parse(jsonLdMatch[1]);
    const types = structured["@graph"]?.map((item) => item["@type"]) || [];
    for (const type of ["Organization", "WebSite", "FAQPage"])
      expect(types.includes(type), `${type} structured data is missing`);
  } catch {
    failures.push("JSON-LD is invalid JSON");
  }
}

for (const path of [
  "/content-protect-social.png",
  "/robots.txt",
  "/sitemap.xml",
  "/.well-known/security.txt",
]) {
  const response = await get(path);
  expect(response.ok, `${path} returned HTTP ${response.status}`);
  const body = await response.text();
  if (path === "/robots.txt")
    expect(body.includes("Sitemap: https://content-protect.com/sitemap.xml"), "robots sitemap is missing");
  if (path === "/sitemap.xml") {
    expect(body.includes("<lastmod>2026-07-18</lastmod>"), "sitemap lastmod is missing");
    expect(!body.includes("/operator"), "operator console is exposed in sitemap");
  }
  if (path.endsWith("security.txt"))
    expect(body.includes("Canonical: https://content-protect.com/.well-known/security.txt"), "security.txt canonical is missing");
}

const operatorResponse = await get("/operator");
expect(
  operatorResponse.headers.get("x-robots-tag")?.includes("noindex"),
  "operator console is not marked noindex",
);
await operatorResponse.arrayBuffer();
const missingResponse = await get("/this-page-must-not-exist");
expect(missingResponse.status === 404, "unknown extensionless URLs do not return 404");
await missingResponse.arrayBuffer();

if (failures.length) {
  console.error(JSON.stringify({ ok: false, base, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, base }, null, 2));
}
