# UK launch governance — signed release gate

Status: technical gate implemented; no launch approval has been issued

Content Protect must not report `productionReady: true` solely because its external integrations are technically configured. Commercial launch additionally requires a current, independently signed governance manifest covering the exact database migration and customer-facing compliance versions deployed in production.

The runtime receives only an Ed25519 public key and the compact signed manifest. The private signing key must stay outside the repository, Render, GitHub and ordinary operator devices. A missing, partial, altered, expired, future-dated, wrong-schema or wrong-policy manifest keeps the `launchGovernance` readiness gate closed.

## Required controls

| Control ID                            | Minimum retained evidence                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `company_filings_current`             | Current Companies House accounts and confirmation statement; no overdue warning                                   |
| `ico_registration_or_exemption`       | ICO registration/fee reference or documented exemption decision                                                   |
| `dpia_and_special_category_basis`     | Approved DPIA, Article 6 basis and Article 9 condition for the actual launch processing                           |
| `processor_contracts_and_transfers`   | Approved DPAs, subprocessor review and UK transfer safeguards for every enabled provider                          |
| `incident_plan_and_tabletop`          | Named emergency contacts, approved incident plan and completed tabletop exercise                                  |
| `independent_penetration_test`        | Independent report, risk acceptance and evidence that launch-critical findings are remediated                     |
| `retention_policy`                    | Approved retention schedule, deletion dry run and named operational owner                                         |
| `creator_safety_and_online_safety`    | Approved adult-only, consent, abuse escalation and UK online-safety assessment                                    |
| `specialist_takedown_dispute_counsel` | Specialist approval of the current notice version, evidence disclosure, counter-notice and dispute workflow       |
| `consumer_terms_tax_and_complaints`   | Approved consumer terms, recurring-billing/refund/complaint process and accountant review of VAT/tax presentation |

Every value in the manifest is an opaque 12–160 character record reference. Do not place names, email addresses, URLs, legal advice, provider messages, telephone numbers or other personal/confidential content in it. The underlying evidence belongs in the approved independent governance record.

## Approval and signing procedure

1. Complete all ten controls and have the designated board/director approver confirm the complete evidence pack. Do not create placeholder references.
2. Generate and escrow an Ed25519 private key outside the project and cloud runtime, with owner-only file permissions (`0600`). Derive its public key separately. Record the authorised key custodian and recovery process.
3. Create an input JSON file outside the repository with exactly `approvedAt`, `expiresAt`, `approverReference` and all ten controls. `approvedAt` and `expiresAt` must be canonical UTC timestamps; validity cannot exceed 370 days.
4. Run `pnpm governance:sign /absolute/input.json /absolute/private-key.pem /absolute/manifest.json`. The command refuses repository paths and refuses to overwrite an existing output. It emits only the output path, digest and non-sensitive summary—not the private key or evidence references.
5. Store the public key as `UK_LAUNCH_GOVERNANCE_PUBLIC_KEY` and the compact one-line manifest as `UK_LAUNCH_GOVERNANCE_MANIFEST` in Render. Never configure the private key in Render or GitHub.
6. Deploy and confirm `/api/health/ready` reports `launchGovernance.status: approved`, `operationalGates.launchGovernance: true`, the current migration and current compliance versions. Preserve the manifest digest with the board approval record.

The manifest is automatically invalidated when it expires, when the required database migration changes, when any compliance version changes, when its signature changes or when the public key does not match. Reapproval must review the actual changed processing; copying old references into a new manifest without review is prohibited.

## Input shape

```json
{
  "approvedAt": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "expiresAt": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "approverReference": "governance/board-approval/opaque-reference",
  "controls": {
    "company_filings_current": "evidence/opaque-reference",
    "ico_registration_or_exemption": "evidence/opaque-reference",
    "dpia_and_special_category_basis": "evidence/opaque-reference",
    "processor_contracts_and_transfers": "evidence/opaque-reference",
    "incident_plan_and_tabletop": "evidence/opaque-reference",
    "independent_penetration_test": "evidence/opaque-reference",
    "retention_policy": "evidence/opaque-reference",
    "creator_safety_and_online_safety": "evidence/opaque-reference",
    "specialist_takedown_dispute_counsel": "evidence/opaque-reference",
    "consumer_terms_tax_and_complaints": "evidence/opaque-reference"
  }
}
```
