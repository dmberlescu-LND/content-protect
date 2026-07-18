# Personal-data and security incident response plan

Status: operational draft requiring management and UK legal approval

## Severity

- **SEV-1:** confirmed or likely exposure of intimate media, credentials, identity data, encryption keys, or widespread unauthorised access.
- **SEV-2:** contained exposure with limited subjects, material service compromise, or loss of evidence integrity.
- **SEV-3:** suspicious activity or availability issue without confirmed personal-data impact.

## First 60 minutes

1. Open an incident record and appoint Incident Commander, Security Lead, Privacy Lead and Communications Lead.
2. Preserve logs and evidence using read-only copies; record all actions and times in UTC.
3. Contain access: revoke affected keys/sessions, isolate workloads and disable risky features.
4. Do not delete evidence, contact suspected attackers, or make public claims without approval.
5. Protect affected creators from further exposure; prioritise intimate-media confidentiality.

## First 24 hours

1. Determine affected systems, users, data categories, jurisdictions and time window.
2. Assess confidentiality, integrity, availability, likelihood and severity of harm.
3. Rotate credentials and encryption material using the documented key-rotation procedure.
4. Engage Render, Cloudflare, Stripe, Resend or other processors through their security channels.
5. Draft creator communications in plain language without exposing additional sensitive data.

## UK notification clock

- The Privacy Lead records when the company became aware of a personal-data breach.
- If notification is required, submit to the ICO without undue delay and, where feasible, within 72 hours.
- If notification occurs later, document the reasons for delay.
- Notify affected individuals without undue delay where the breach is likely to create a high risk to their rights and freedoms.
- Record the decision and reasoning even when notification is not required.

## Recovery and closure

1. Restore from a known-good state and validate access controls, checksums and deletion tombstones.
2. Monitor for recurrence and require two-person approval before re-enabling live scanning/takedowns.
3. Complete a root-cause analysis within 10 business days.
4. Assign corrective actions, owners and deadlines; verify completion independently.
5. Retain the incident record under the approved retention schedule.

## Emergency contacts to complete before launch

- ICO registration/reference: **TBD**
- External UK privacy counsel: **TBD**
- Cyber-insurance hotline: **TBD**
- Render/Cloudflare/Stripe/Resend escalation contacts: **TBD**
- Director on-call number: **TBD**
