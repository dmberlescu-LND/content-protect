# Content Protect SEO launch runbook

Owner: White Eagles Digital Marketing LTD  
Primary property: `content-protect.com`  
Locale: `en-GB`

## Commissioned controls

- Google Search Console domain property verified through the domain-provider DNS method on 19 July 2026.
- The root verification TXT record must remain in Porkbun. Removing it can revoke ownership verification.
- `https://content-protect.com/sitemap.xml` submitted and accepted by Google Search Console with status **Success** and six discovered pages on 19 July 2026.
- The sitemap is served as `application/xml; charset=utf-8`, remains revalidatable and is referenced by `robots.txt`.
- Canonical URLs, `en-GB` hreflang, Open Graph metadata, a large social card and Organization/WebSite/FAQ structured data are checked by `pnpm verify:seo`.
- Private application routes, the operator console and the cancellation form are excluded from the sitemap; authenticated APIs are disallowed in `robots.txt`.

## Release checks

1. Run `pnpm verify:seo` against the public domain after every production deploy.
2. Confirm the production monitor passes on the deployed commit.
3. In Search Console, confirm the sitemap remains **Success** and review Pages, Core Web Vitals, Security Issues and Manual Actions.
4. Treat search-performance data as pending until Google has completed initial processing; verification and sitemap acceptance do not guarantee ranking or indexing.
5. When a public page is materially changed, update its sitemap `lastmod` date and keep the canonical URL stable.

## Monthly review

- Check indexing exclusions and resolve only genuine crawl or canonical errors.
- Review branded and non-branded queries without collecting creator-sensitive search data.
- Check structured-data enhancements and mobile Core Web Vitals.
- Confirm no authenticated, operator, customer or private-media URL appears in the index.
- Record material actions and the responsible operator in the launch log.

## Pending expansion

- Bing Webmaster Tools may be connected by importing the verified Google Search Console property. Granting that cross-service permission requires a separately reviewed operator action.
- Analytics or advertising tags remain out of scope until consent requirements, data minimisation and the cookie notice are reviewed for the exact vendor configuration.
