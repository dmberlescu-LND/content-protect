# Content Protect: discovery and enforcement roadmap

Status: proposed execution plan — 5 September 2026. This is a commercial and operational roadmap, not a claim that Content Protect already has the coverage, provider relationships or removal performance described below.

## The objective

Build two real, measurable capabilities for verified creators:

1. Find likely unauthorised uses of a creator's images and video across approved, lawful discovery routes.
2. Turn verified matches into accurate, evidence-backed takedown cases and manage the case until a recorded outcome.

The reference standard is the public positioning of established services such as BranditScan. Their public claims of large-scale discovery, removal operations and Google relationships must be treated as competitor claims, not independently verified benchmarks. Content Protect must earn comparable trust through evidence, not marketing language.

## Non-negotiable operating rules

- Do not say a scan, removal, Google delisting or platform partnership happened unless the case record proves it.
- Do not transmit intimate media, video frames or biometric/face data to a provider without the relevant written provider permission, privacy review and creator consent.
- Do not use unapproved scraping, credential sharing, platform impersonation or bypasses of platform access controls.
- Every automated match remains a lead until a creator or trained operator verifies the source, rights and evidence.
- Every external notice remains reviewable, reversible where possible and legally approved before delivery.
- Google removal workflows may be offered only through the applicable official route and only after the eligibility/relationship is actually confirmed.

## Where we are today

| Capability | Current position | What is missing for commercial use |
| --- | --- | --- |
| Still-image discovery | Secure TinEye connector and result filtering are built; sandbox protocol was tested. | TinEye written permission for lawful adult content, DPA/transfer review, commercial key and measured live coverage. |
| Video discovery | Controlled frame-extraction path is built but intentionally disabled. | Frame-specific provider permission, privacy/legal approval, cost approval and a consented live test. |
| Match evidence | Source capture, claimant declaration, audit trail and case binding are built. | Real source coverage and an operator quality-review programme. |
| Notice preparation | Draft/review/approval workflow and dispute freeze are built. | Specialist UK copyright review of the current notice template and country/platform playbooks. |
| Notice delivery | Safely sandboxed and fail-closed. | Approved live delivery routes, trained operators, escalation paths and measured results. |
| Google/platform relationship | None claimed. | Eligibility, applications, operating history and a confirmed official relationship where available. |

## Stage 0 — prove the legal and vendor route

**Target:** complete the currently blocked gates without processing a single real creator's intimate media through an unapproved provider.

Deliverables:

1. Obtain TinEye's written answer covering: permitted content, still images, derived video frames, API terms, retention, subprocessors and UK/international transfers.
2. Have UK privacy and copyright counsel complete the DPIA, lawful-basis review and takedown template review.
3. Create an approved source register. Each source must state the permitted access method, geography, content rules, evidence method, report/notice route, escalation route and owner.
4. Create a provider scorecard: coverage, precision, latency, cost per query, adult-content permissions, deletion/retention terms, incident route and DPA status.
5. Define creator pilot terms, informed consent, exclusion criteria, refund/cancellation route and an urgent-harm escalation process.

**Exit evidence:** written approvals stored outside the repository; opaque approval references in configuration; `/api/health/ready` shows the relevant gate as ready; one non-explicit consented live test per enabled route.

## Stage 1 — commercial discovery MVP

**Target:** a small but real service that customers can understand and we can measure.

Scope:

- Enable only approved still-image search first.
- Accept creator-supplied URLs and approved provider/API results; no unapproved crawling.
- Run scheduled scans at a clear plan-defined frequency.
- Normalise every result into one match record: provider, query asset reference, source URL, confidence, first/last seen, screenshot/evidence reference, reviewer outcome and reason.
- Keep a false-positive feedback loop: `confirmed infringement`, `authorised use`, `not a match`, `uncertain`.

Initial operating model:

| Item | MVP standard |
| --- | --- |
| Pilot size | 20–50 consented adult creators, added gradually after all gates pass. |
| Review SLA | New high-confidence match reviewed within one business day. |
| Quality target | Measure precision weekly; do not market a recall percentage until independently supportable. |
| Discovery report | Show source, confidence, evidence date and next action; never promise a removal. |
| Cost control | Per-plan query allowance, alerts at 70/90%, hard provider spending cap and daily reconciliation. |

**Exit evidence:** four weeks of pilot data, documented false-positive rate, source-level coverage report, cost per reviewed match and zero unresolved privacy/security incidents.

## Stage 2 — coverage and reliability

**Target:** reduce dependency on one source and make results useful over time.

Build in this order:

1. Provider-agnostic discovery queue and connector contract, so a second approved provider can be added without changing customer cases.
2. Source registry and coverage dashboard: enabled sources, allowed region/content, last successful scan, volume, match rate and quality score.
3. Duplicate clustering: same destination URL or rehost cluster is one operational case with preserved source evidence.
4. Change detection: record first seen/last seen and resurface removed/reappeared URLs without repeatedly billing the customer for identical evidence.
5. Only after the above, add approved video-frame scans; start with an explicit limited allowance and separate customer consent.

Do not make facial recognition a first-stage feature. It introduces significant biometric/privacy risk and needs a separate legal, DPIA, provider and safety decision.

**Exit evidence:** at least two approved discovery routes, source-level metrics for eight weeks, documented service availability and a tested provider outage fallback.

## Stage 3 — takedown operations desk

**Target:** a dependable human-led enforcement service, not an email generator.

Case lifecycle:

`match → creator confirmation → evidence review → notice draft → creator approval → operator delivery → acknowledgement → follow-up/escalation → outcome/dispute closure`

The desk needs:

- A playbook per route: host/registrar, platform copyright form, search-engine legal form, social platform form and repeat-infringer escalation.
- A rights/evidence checklist before delivery, including claimant capacity and a contemporaneous capture of the target page.
- Trained, named operators; second-person review for high-risk or disputed matters.
- Measured follow-ups, with no automated resubmission that could create duplicate notices or harm a creator's case.
- A clear dispute intake, immediate case freeze and counsel escalation path already supported by the application.

Pilot service levels:

| Metric | Initial target |
| --- | --- |
| Draft after creator confirmation | 1 business day |
| Delivery after final approval | 1 business day |
| First follow-up | 7 calendar days if no acknowledgement |
| Escalation review | 14 calendar days if unresolved |
| Reporting | Weekly case status and monthly source/platform outcomes |

**Exit evidence:** 100+ real pilot cases (or a legally approved equivalent test set), audited delivery records, response/outcome metrics by route, and counsel review of edge cases and disputes.

## Stage 4 — platform and Google scale

**Target:** qualify for formal, documented relationships rather than claiming them in advance.

Build a monthly partner dossier with: notice volume, valid-notice rate, response rate, removal/delisting rate, dispute/reversal rate, evidence quality, named compliance contact and audit samples. Use the official Google copyright/legal reporting routes initially. Apply to any programme such as the Google Trusted Copyright Removal Program only when eligibility is met and acceptance is confirmed in writing.

For platforms and hosts, work through official copyright portals, documented abuse contacts and formal partner routes when they exist. Relationships are earned through accurate notices, reliable evidence and volume; they cannot be bought or coded into the product.

**Exit evidence:** confirmed programme terms or partner correspondence, a named owner, written operating boundaries and reporting that separates removals, deindexing, rejected notices and pending cases.

## Scorecard: the proof that we are becoming comparable

Review this monthly, per source and per customer plan:

| Discovery | Enforcement | Trust and safety |
| --- | --- | --- |
| Enabled approved sources | Notices delivered | Privacy incidents |
| Scan success and latency | Acknowledged / removed / deindexed rate | Disputes and reversals |
| Confirmed-match precision | Median time from match to action | Audit completeness |
| Coverage by country/platform | Cost per resolved case | Provider/DPA status |
| Reappearance rate | Overdue follow-ups | Customer satisfaction / cancellation reasons |

Never publish a percentage, customer count, source count or removal statistic unless this scorecard and underlying case evidence can substantiate it.

## First 30 days of execution

1. Close the TinEye response loop and record the answer in the vendor file.
2. Appoint copyright/privacy counsel and obtain the two written reviews.
3. Populate the source register with the first 10 lawful routes and their official reporting forms.
4. Add a provider/source scorecard and operational reporting screens to Content Protect.
5. Prepare the pilot-creator agreement, onboarding script, consent screens and support escalation rota.
6. Once the gates are approved, run five non-explicit consented acceptance tests before inviting any pilot creator.

## Realistic path to competitor-level maturity

With approvals and a focused operations budget, a credible MVP can run in roughly 2–3 months after Stage 0 is cleared. A measured multi-source discovery and takedown desk needs roughly 6–12 months of real pilot operations. Formal platform relationships and a reputation comparable to an established provider typically require 12–24 months of verified volume and consistently accurate notices.

The decisive investment is not only software: it is lawful data access, legal review, trained operations, evidence quality, support and partner credibility. The product already contains a strong fail-closed base; the next value comes from converting that base into approved, measured real-world operations.
