# Content Protect — counsel review brief

Prepared for: UK privacy and copyright/online-safety counsel  
Controller: White Eagles Digital Marketing LTD  
Product: Content Protect  
Status: pre-launch; no commercial scanning or live notice delivery is enabled

## What Content Protect is building

Content Protect is a UK service for verified adults who own or are authorised to protect their original content. The intended workflow is:

`creator verification → rights/consent record → private reference media → approved still-image matching → human match review → creator approval → notice preparation → approved delivery route → dispute/outcome record`

The product will not claim that a match proves infringement or that a report guarantees removal. It will not use facial recognition, scrape unapproved services, request creator-platform passwords, transmit original encrypted media, or automatically send notices.

## First proposed pilot

- Five invited adult creators only.
- Non-explicit reference images first; video frames remain disabled.
- Still-image provider: TinEye API, subject to contract/DPA and the decisions requested below.
- Reference image sent to provider: resized JPEG, metadata removed, under 1 MB. The encrypted original is not sent.
- TinEye’s written response says lawful adult-content searches and extracted still images are permitted where the customer has appropriate rights/authority; it also states query images are held internally for no more than 24 hours. The original correspondence is retained outside this repository.
- No live payment or commercial customer invitation before separate Stripe and age-verification gates pass.

## Decisions requested

Please provide a brief written response to each point, identifying any conditions or changes needed.

### A. UK GDPR and privacy

1. Appropriate controller role, Article 6 lawful basis and, where applicable, Article 9 condition for this workflow.
2. Whether the proposed creator consent/rights declarations, Privacy Notice and Terms need changes before a pilot.
3. Whether the current DPIA adequately identifies and mitigates the processing risks for intimate adult media and public match URLs.
4. Whether the TinEye processing and Canadian location can rely on the applicable UK adequacy position for PIPEDA-governed processing, or whether additional transfer safeguards/assessment are needed.
5. Required retention periods, subject-access/deletion approach, and policy for incidental third-party data in discovered pages.
6. Whether ICO registration is required, with rationale.

### B. Copyright, notices and agent representation

1. Whether Content Protect may act as an authorised agent for a creator and what authority wording/evidence must be retained.
2. Required claim, good-faith, accuracy, contact-disclosure and signature wording for the first notice template.
3. Which initial jurisdictions and routes are safe for a UK service to use in a limited pilot.
4. Counter-notice, dispute, retraction, evidence-preservation and escalation handling requirements.
5. Specific rules for non-consensual intimate imagery, impersonation, doxxing, threats, coercion and urgent-safety cases.
6. Whether the initial public claims and pricing language are accurate and sufficiently qualified.

### C. Operational constraints

1. Confirmation that no live notice should be sent without human review, creator approval and a contemporaneous target-page capture.
2. Required operator training, supervision and second-review thresholds.
3. Suggested pilot agreement/waiver boundaries and complaints process.
4. Any mandatory insurance, policies or external reporting routes before operating.

## Documents for review

Provide the following from a secure company folder or repository read-only access. Do not provide customer files, passwords, API keys, raw identity documents, payment information or intimate media.

1. `docs/compliance/DPIA-DRAFT.md`
2. `docs/compliance/ROPA.md`
3. `docs/compliance/TAKEDOWN-AND-DISPUTE-PROCEDURE.md`
4. `docs/compliance/UK-LAUNCH-GOVERNANCE.md`
5. `docs/PILOT-READINESS-RUNBOOK.md`
6. `docs/OFFICIAL-REPORTING-ROUTE-REGISTER.md`
7. `docs/vendor-due-diligence/TINEYE-ACTIVATION.md`
8. The public Privacy Notice, Terms, Safety and Disputes pages.

## Requested output

Please return:

- a signed or email-confirmed approval/revision memo;
- the reviewed versions of any public/legal wording;
- specific conditions, exclusions and expiry/review dates;
- a reference we can record in launch governance without storing your advice or confidential material in application configuration.

## Important limitation

This brief is an operational request for legal advice. It is not a legal opinion and must not itself be used to represent that the product, a provider, a creator claim or a takedown notice has legal approval.
