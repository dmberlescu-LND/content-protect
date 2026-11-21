# Content Protect — readiness reassessment

**Assessment date:** 21 November 2026  
**Assessment status:** internal, evidence-led, not legal advice and not a commercial launch approval.

## Executive decision

Content Protect is ready for a controlled, free, invitation-only pilot **as a private-vault and human-review rehearsal**. It is not ready to advertise live discovery, automated removals, Google/platform relationships or paid customer outcomes. The live free pilot now displays a multilingual Basic Search Preview after a reference upload, while the real scan route remains fail-closed.

Overall current maturity is **42/100** against the expectation set by a mature competitor such as BranditScan. The score reflects verified delivery, not competitor marketing claims.

## Evidence checked

| Evidence | Result | State |
| --- | --- | --- |
| Render service `srv-d9drt2taeets739tqhmg` | `/api/health/ready` returned `ok: true`, release `fb8bc73a2014`, with PostgreSQL, private storage, audit integrity and backup/restore healthy; monitoring evidence is still bound to the previous release and is pending the next heartbeat | Verified / monitoring pending |
| Live website | Free controlled-pilot dashboard, multilingual Basic Search Preview and known-URL human-review CTA visible at `content-protect.com` | Verified |
| GitHub PR #19 | Merged to `main`; manual known-URL review path and pilot guards included | Verified |
| Local pilot guards | Basic Search, admission pack, free-pilot deployment and Yoti policy tests passed | Verified |
| Full local suite | Stops at the macOS `sharp` native-binding signature error; this is an environment issue, not a passing result | Blocked locally |
| Trial entitlement policy | Sequential 30-day Monitor/Protect/Pro schedule, invitation binding and no-billing/provider-scan guard passed locally | Verified |
| Paid discovery | TinEye commercial route is not activated; no image is transmitted to a provider | Intentionally blocked |
| Takedown delivery | Live delivery remains disabled; creator approval and legal route are required | Intentionally blocked |
| Launch readiness | `productionReady` remains false; backup/restore is true and monitoring is pending release-bound heartbeat evidence, while commercial, legal, retention, audit-export and governance gates remain intentionally closed | Blocked |

## Comparative scorecard

| Capability | Current | Mature competitor expectation | Main gap |
| --- | ---: | ---: | --- |
| Product foundation | 62 | 90 | No proven end-to-end commercial service |
| Discovery engine | 22 | 90 | No approved paid source, coverage or quality dataset |
| Takedown operations | 30 | 90 | No counsel-approved live route or measured outcomes |
| Legal/privacy | 40 | 85 | DPIA, transfer and specialist review still open |
| Payments | 35 | 90 | Stripe live acceptance and pricing approval still open |
| Identity/age assurance | 45 | 85 | Controlled Yoti sandbox only |
| Security/resilience | 72 | 85 | Penetration test, current monitoring evidence and custody review open |
| UX/creator clarity | 58 | 85 | No measured onboarding/support outcomes yet |
| SEO/acquisition | 35 | 85 | No qualified traffic or conversion evidence |
| Operations/reporting | 48 | 90 | No measured live queue or outcome history |
| Commercial readiness | 18 | 90 | Paid onboarding is correctly disabled |

## Exact MVP-to-mature-service differences

1. **Discovery:** our connector and policy boundary exist; a mature service has an approved provider, recurring queries, source-level coverage and measured precision.
2. **Enforcement:** our case, evidence and approval controls exist; a mature service has reviewed route playbooks, trained operators, platform contacts and outcome history.
3. **Trust:** our vault, consent, audit and fail-closed controls are stronger than a typical prototype; the missing proof is lawful live operation at volume.
4. **Commercial:** our Stripe and Yoti safeguards are test-oriented; a mature service has approved live verification, billing, refunds, support and cancellation evidence.
5. **Market proof:** our public site is clear about limits; a mature service can substantiate traffic, conversion, response times, removal rates and unit economics.

## Phased plan

### Phase A — controlled free pilot with Luxandra

**Objective:** rehearse private intake, consent, rights declaration, evidence capture, case preparation and creator/operator review without provider transmission, billing or live notice delivery.

**Deliverables:** one creator admission pack; one non-explicit reference asset; withdrawal/deletion rehearsal; one known-URL evidence rehearsal; weekly pilot report; no unsupported outcome claim.

**Dependencies:** creator consent and authority record; approved pilot wording/DPIA decision; named operator and safety route. TinEye is not required if the pilot stays provider-free.

**Risk:** confusing a known URL or historical removal with discovery coverage; processing high-risk media outside the approved scope.

**Cost estimate:** £0 platform cost; external counsel/verification only if selected and approved.

**Owner:** director, operator, privacy/copyright counsel.

**Exit gate:** five documented non-provider acceptance rehearsals, no unresolved high-severity incident, and written go/no-go decision.

**Status:** Prepared / Executed / Verified for the software and free-pilot guard; creator admission and legal sign-off remain Blocked.

### Phase B — discovery and takedown validation

**Objective:** enable one approved still-image provider and one approved notice route for a tightly capped cohort.

**Deliverables:** TinEye permission/DPA/transfer evidence; hard query cap and no auto-top-up; counsel-approved notice; 20 reviewed leads; route-level status metrics.

**Dependencies:** Phase A exit, provider and counsel approvals, operator rota.

**Risk:** false positives, invalid authority, provider-policy breach and uncontrolled spend.

**Cost estimate:** planning range £100–£500/month for a capped provider pilot, excluding legal and supplier quotes; no spend is authorised by this document.

**Owner:** director, provider owner, operator lead, counsel.

**Exit gate:** four weeks of measured quality/cost data, documented false-positive rate, zero unresolved high-severity incident.

**Status:** Blocked on external provider/legal gates.

### Phase C — commercial activation

**Objective:** accept a small paid cohort only after every customer-impacting control is evidenced.

**Deliverables:** live verification or documented alternate; Stripe live checkout/webhook/cancellation/refund evidence; signed DPIA/ROPA/terms; retention and incident approval; penetration-test decision; signed launch manifest.

**Dependencies:** all applicable launch-gate rows and written director approval.

**Risk:** legal liability, payment disputes, underpriced human support and inaccurate takedowns.

**Cost estimate:** indicative fixed operating budget £500–£2,000/month before labour and payment fees; all provider and legal costs require written quotes.

**Owner:** director, counsel, finance, security reviewer, operations lead.

**Exit gate:** `/api/health/ready` reports all required operational gates true and `productionReady: true`.

**Status:** Blocked.

### Phase D — competitive scaling

**Objective:** earn a credible mature-service position through measured volume and reliable operations.

**Deliverables:** multiple approved discovery routes, source-level quality data, route library, trained desk, partner dossier and unit economics.

**Dependencies:** lawful volume, provider relationships, funded operations and 6–12 months of measured commercial data.

**Risk:** scaling inaccurate automation, unprofitable support or unsupported partner claims.

**Cost estimate:** variable; build from actual cost per query, review, notice and resolved case rather than a fixed promise.

**Owner:** director, product and operations leads.

**Exit gate:** at least 100 reviewed real cases (or counsel-approved equivalent), route-level outcome evidence and audited operating controls.

**Status:** Future / Blocked pending Phase C.

## Time estimate

| Milestone | Realistic estimate from current state | Condition |
| --- | --- | --- |
| First safe controlled pilot | 2–4 weeks | Pilot wording/DPIA decision and admission evidence |
| First paying customer | 3–5 months | Provider, legal, verification and Stripe approvals |
| Stable commercial service | 5–8 months | Live gates, support capacity and measured operations |
| Credible mature-competitor level | 12–24 months | Verified volume, route relationships and outcome history |

## Action boundary

### Can be done now without external cost

- Complete internal guards, documentation, test fixtures and operator runbooks.
- Rehearse the free private-vault flow with synthetic or approved non-explicit data.
- Prepare the weekly evidence report and known-URL evidence workflow.
- Keep all paid providers, automatic billing, video matching and live notices disabled.

### Requires director approval at action time

- Publishing further code or documentation to GitHub/Render.
- Inviting Luxandra or processing real creator media.
- Buying provider credits, enabling live flags or changing provider settings.
- Sending any external notice or commercial message.

### Requires an external party

- Counsel: DPIA, lawful basis, transfer and takedown review.
- TinEye: commercial permission, DPA and API key/content scope.
- Yoti: live organisation approval and production receipt test.
- Stripe: live account/products, webhook and refund/cancellation acceptance.
- Independent tester: penetration-test report and remediation decision.

**Current decision:** continue internal pilot rehearsal and evidence preparation; stop at the next external approval or paid-provider gate.

## Free-pilot usability improvement — known-URL review

**Status:** Published / targeted tests passed / live rendering verified.

The free pilot now gives a creator a useful action even while external discovery is
blocked: from the Basic Search preview, the creator can open Help & Safety and
submit an exact public HTTPS URL that they already found. This is a manual review
intake, not a reverse-image search and not proof that the platform discovered the
page. The existing safety intake remains the boundary for the URL, and the operator
must preserve evidence and obtain creator approval before any takedown workflow.

This is the recommended free-tier value proposition: secure reference storage,
rights/consent record, and one known-URL review path. The public UI is now
available in English, Spanish and Romanian. Do not label the result a
“match” until the page is captured, reviewed and linked to the creator's reference.
Do not send the reference image to a third party, create simulated matches, or
promise web-wide coverage.

**Exit evidence for this improvement:** the multilingual CTA renders only in the
free pilot after an image upload; the targeted Basic Search, pilot-admission and
free-pilot deployment guards pass; the production health endpoint reports
`productionReady: false` with external gates fail-closed; no provider or
notification route is activated.
