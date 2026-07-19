const base = (process.env.APP_URL || "https://content-protect.com").replace(
  /\/$/,
  "",
);
const failures = [];
const sitemapLastModified = "2026-07-19";
const isLocalStaticPreview =
  /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base);
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
expect(
  home.includes('name="twitter:card" content="summary_large_image"'),
  "large Twitter card is missing",
);

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
    expect(
      body.includes("Sitemap: https://content-protect.com/sitemap.xml"),
      "robots sitemap is missing",
    );
  if (path === "/sitemap.xml") {
    expect(
      body.includes(`<lastmod>${sitemapLastModified}</lastmod>`),
      `sitemap lastmod ${sitemapLastModified} is missing`,
    );
    expect(
      !body.includes("/operator"),
      "operator console is exposed in sitemap",
    );
  }
  if (path.endsWith("security.txt"))
    expect(
      body.includes(
        "Canonical: https://content-protect.com/.well-known/security.txt",
      ),
      "security.txt canonical is missing",
    );
}

if (!isLocalStaticPreview) {
  const operatorResponse = await get("/operator");
  expect(
    operatorResponse.headers.get("x-robots-tag")?.includes("noindex"),
    "operator console is not marked noindex",
  );
  await operatorResponse.arrayBuffer();
  const missingResponse = await get("/this-page-must-not-exist");
  expect(
    missingResponse.status === 404,
    "unknown extensionless URLs do not return 404",
  );
  await missingResponse.arrayBuffer();
}

for (const path of [
  "/privacy.html",
  "/terms.html",
  "/safety.html",
  "/cookies.html",
  "/disputes.html",
  "/cancellation-form.html",
]) {
  const response = await get(path);
  const body = await response.text();
  expect(response.ok, `${path} returned HTTP ${response.status}`);
  expect(
    new RegExp(
      `<link\\s+rel=["']canonical["']\\s+href=["']https://content-protect\\.com${path.replace(".", "\\.")}["']`,
    ).test(body.replace(/\s+/g, " ")),
    `${path} canonical is missing`,
  );
  expect(body.includes('name="description"'), `${path} description is missing`);
  const expectedRobots =
    path === "/cancellation-form.html" ? "noindex,follow" : "index,follow";
  expect(
    body.includes(`name="robots" content="${expectedRobots}"`),
    `${path} robots directive is incorrect`,
  );
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, base, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, base }, null, 2));
}
