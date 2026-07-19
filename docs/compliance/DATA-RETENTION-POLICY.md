# Data retention and deletion policy — approval draft

Owner: White Eagles Digital Marketing LTD  
Review cadence: every 12 months and after any material processing change  
Status: operational draft requiring UK legal and DPO review

## Principles

Content Protect keeps personal data only for a documented purpose and period. Deletion means removal from active systems followed by expiry from encrypted backups. Legal holds suspend deletion only for the affected records and must be documented.

## Schedule

| Record                                                                      |                    Active retention | Deletion trigger                   |        Backup expiry target |
| --------------------------------------------------------------------------- | ----------------------------------: | ---------------------------------- | --------------------------: |
| Unverified account                                                          |                             30 days | Email not verified                 |                     35 days |
| Account/profile                                                             |              Account life + 30 days | Verified deletion request          |                     35 days |
| Encrypted reference media                                                   | Until user deletion/account closure | User action or contract end        |                     35 days |
| Derived fingerprints/embeddings, if a future approved provider enables them |                Same as source asset | Source deletion                    |                     35 days |
| Match evidence                                                              |        12 months after case closure | Retention expiry unless legal hold |                     35 days |
| Takedown communications                                                     |          6 years after case closure | Limitation/recordkeeping expiry    |                     35 days |
| Failed identity/age check metadata                                          |                             90 days | Check completed/abandoned          |                     35 days |
| Successful verification result                                              |              Account life + 30 days | Account closure                    |                     35 days |
| Raw identity documents                                                      |     Not retained by Content Protect | Provider-controlled                |           Provider contract |
| Authentication/security logs                                                |                           12 months | Rolling expiry                     |                     35 days |
| Billing and tax records                                                     |        6 years after financial year | Statutory expiry                   |                     35 days |
| Support conversations                                                       |             24 months after closure | Rolling expiry                     |                     35 days |
| Password reset/email verification tokens                                    |                    24 hours maximum | Use or expiry                      | Not backed up intentionally |

## Controls

- A fail-closed retention command previews eligible PostgreSQL records with `pnpm retention:preview`. Execution additionally requires `RETENTION_EXECUTION_ENABLED=true` and `pnpm retention:execute`. The Render Blueprint creates the daily 03:17 UTC job in preview-only mode first. Activation requires review of a production preview and a separately approved configuration change. It must not be described as operational until an executing job has produced a successful evidence row; readiness expires that evidence after 36 hours.
- Object deletion and database deletion must both succeed; failures create an operational alert.
- Account deletion is blocked only by a documented legal hold or mandatory financial retention.
- Restore procedures must reapply all deletion tombstones created after the backup timestamp.
- Quarterly sampling verifies that expired objects cannot be retrieved.
- Closed takedown cases under a documented legal hold are excluded from scheduled deletion until the hold is released.
- Account deletion archives only the minimum subscription and billing-consent record under a pseudonymous former-user reference for the six-year statutory period; service data and media are deleted.
