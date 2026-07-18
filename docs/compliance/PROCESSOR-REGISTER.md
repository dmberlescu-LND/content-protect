# Processor and transfer register — approval draft

No provider may receive production personal data until its DPA, security terms, subprocessor list, retention/deletion terms and international-transfer mechanism have been reviewed.

| Provider | Purpose | Expected data | Region/transfer | Contract status | Production gate |
|---|---|---|---|---|---|
| Render | Application and PostgreSQL hosting | Accounts, metadata, encrypted media transit | Frankfurt/EU | DPA review required | Blocked |
| Cloudflare R2 | Private encrypted object storage | Client-side encrypted media objects | Confirm account location | DPA review required | Blocked |
| Stripe | Subscription billing | Email, customer/subscription/payment metadata | Provider-controlled | DPA and UK terms review | Test only |
| Resend | Transactional email | Email address and message content | Ireland selected | DPA review required | Account email only |
| Age/identity provider | Adult/identity verification | Minimum verification attributes | Provider TBD | Not selected | Blocked |
| Scan provider(s) | Image/video matching | Fingerprints or minimum required media | Provider TBD | Not selected | Blocked |
| Monitoring provider | Logs/alerts | Redacted operational metadata | Provider TBD | Not selected | Blocked |

## Required evidence per provider

- Signed DPA and controller/processor roles.
- Hosting locations and UK GDPR transfer safeguard where applicable.
- Subprocessor notification mechanism.
- Encryption, access control, incident notification and deletion commitments.
- Independent security assurance and current penetration-test summary where available.
- Documented exit/export/deletion procedure.
