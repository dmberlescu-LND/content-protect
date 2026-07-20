# Content Protect UK launch-gate register

Status: working operational register — 20 July 2026. This register is not legal advice and does not itself approve a gate. A control is complete only when the stated evidence exists, has been reviewed and is included in the signed launch-governance manifest.

For the owner-by-owner request, evidence and acceptance-test sequence, use [`EXTERNAL-APPROVAL-PACK.md`](EXTERNAL-APPROVAL-PACK.md).

## Current technical baseline

| Control                     | Current status        | Evidence                                                                                                                                                         |
| --------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production release          | deployed, pre-launch  | Render release `17681074b8dd` is healthy with PostgreSQL, private storage, external key management and a valid audit chain.                                      |
| Dependency security         | completed             | Production dependency audit returned no known moderate/high/critical vulnerabilities after the Yoti transitive dependency overrides; 37 automated checks passed. |
| Backup and isolated restore | completed and current | Authenticated restore evidence is bound to `022_subscription_consent_binding.sql`.                                                                               |
| External monitoring         | completed and current | GitHub monitor evidence is bound to release `17681074b8dd`.                                                                                                      |
| Retention execution         | deliberately disabled | A schema-bound preview completed without deleting data; executing lifecycle automation is not approved.                                                          |
| Launch governance           | blocked               | No signed approval manifest exists.                                                                                                                              |

## Commercial launch gates

| Gate                                              | Status  | Owner                               | Required evidence before approval                                                                                                        |
| ------------------------------------------------- | ------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Companies House filings                           | blocked | Director / accountant               | Accounts and confirmation statement filed; official register rechecked with no overdue warning.                                          |
| ICO registration or exemption                     | blocked | Director / privacy counsel          | ICO reference or written exemption analysis.                                                                                             |
| DPIA, Article 6/9 basis and creator-safety review | blocked | UK privacy counsel                  | Approved DPIA, lawful-basis review, special-category condition, safety escalation process and published privacy notice/version.          |
| Processor contracts and transfers                 | blocked | Director / privacy counsel          | DPA, subprocessor review and UK transfer assessment for every enabled processor.                                                         |
| TinEye still-image authorisation                  | blocked | Director / TinEye / privacy counsel | Written lawful-adult-content confirmation, API/DPA/transfer approval and opaque evidence references in Render.                           |
| TinEye video-frame authorisation                  | blocked | Director / TinEye / privacy counsel | Written frame-specific authorisation, approved DPIA/legal wording and three-query-per-video cost approval.                               |
| Yoti live verification                            | blocked | Director / Yoti                     | Live organisation approval, live credentials, consented end-to-end receipt test and retained non-personal evidence.                      |
| Stripe live billing                               | blocked | Director / Stripe                   | Stripe account approval, real test-mode Checkout/refund/cancellation evidence, then approved live prices and webhook test.               |
| Takedown and dispute legal review                 | blocked | Specialist copyright counsel        | Counsel approval of template `2026-07-19-v3`, dispute workflow, jurisdiction routes and operator acceptance-test evidence.               |
| Independent penetration test                      | blocked | Director / independent tester       | Scope, dated report, remediation evidence and residual-risk decision.                                                                    |
| Retention execution approval                      | blocked | Privacy counsel + operations        | Approved retention schedule, reviewed production preview, authorised executing configuration and fresh successful execution evidence.    |
| Independent audit custody                         | blocked | Director / privacy counsel          | Separate S3-compatible destination, DPA/transfer/custody approval, verified 400-day lifecycle and successful encrypted export/read-back. |
| Incident tabletop                                 | blocked | Director / operators / counsel      | Named contacts, dated tabletop record, actions/owners and closure evidence.                                                              |
| Signed UK launch governance                       | blocked | Director / board                    | Offline Ed25519-signed current manifest containing every approved control reference.                                                     |

## Engineering follow-up

| Item                            | Status                     | Next action                                                                                                                   |
| ------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GitHub dependency-audit CI rule | completed                  | GitHub workflow scope was re-authorised; the rule was published in commit `17681074b8dd` and audits production dependencies before tests and build. |
| Commercial production flags     | intentionally off          | Do not set live provider flags until the corresponding gate above is approved and evidenced.                                  |
| Public launch claim             | prohibited                 | Do not claim the product is commercially live while `/api/health/ready` reports `productionReady: false`.                     |

## Director sign-off sequence

1. Complete every row marked **blocked** and retain the stated evidence outside the repository.
2. Have counsel and the responsible operational owner review the real evidence, not this checklist alone.
3. Configure each provider only after its row is approved, then run its constrained live acceptance test.
4. Create and verify the signed launch-governance manifest against the deployed migration and compliance versions.
5. Confirm `/api/health/ready` reports every operational gate as `true` and `productionReady: true`.
6. Record the launch decision, monitoring owner and rollback contact before inviting customers.
