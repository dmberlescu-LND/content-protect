# Data Protection Impact Assessment — structured draft

Controller: White Eagles Digital Marketing LTD (Content Protect)  
Status: incomplete; live biometric/facial matching and real intimate-media processing remain disabled

## Processing purpose

Help verified adult rights holders identify suspected unauthorised copies of content they control, preserve evidence and approve proportionate reporting/takedown actions.

## Data and people

- Adult creator account, public aliases and public profile URLs; per-file rights-holder name, claimant capacity, authority declaration and restricted evidence reference.
- Encrypted reference photos/videos, which may include intimate content.
- Provider-prepared, resized images with embedded metadata removed. A separately gated video path can derive no more than three resized JPEG frames from a video no longer than ten minutes in bounded application memory; audio, subtitles, metadata and the full video are never sent to the matching provider. Facial/biometric templates remain disabled.
- Public-page URLs, provider crawl metadata, match-ranking scores and case communications. Content Protect does not currently claim to create independent page captures.
- Age/identity verification result without retaining raw identity documents.
- Security, consent, audit and billing records.
- Incidental third parties appearing in source or discovered content require a minimisation and redaction procedure.

## Necessity and proportionality controls

- Email verification, Yoti Digital Identity's derived `age_over:18` result and authority declarations before real processing. Content Protect retains no identity document, face image or date of birth from this flow. Identity verification must not be claimed unless a separately approved provider flow is active.
- Search only content submitted by the declared rights holder or authorised representative. Each file requires a versioned declaration, and a takedown cannot be prepared until a trained operator reviews the separately restricted supporting record.
- Transfer only a resized, metadata-stripped provider copy where the enabled scan provider requires an image; never send the encrypted stored object or unrelated vault files. Video-frame processing must remain disabled until its additional approval reference exists. Once approved, decode locally with network protocols blocked, derive at most three frames, send each frame through the same image minimisation path and never transmit audio or the full video.
- No public profiles, advertising use, model training or sale of creator data.
- Human review and creator approval before every external notice.
- Provider match scores are ranking signals and leads, not confidence values or proof of infringement.
- User deletion, access and correction paths with documented retention.
- Biometric processing remains technically disabled until Article 6 basis, Article 9 condition, explicit scope and counsel approval are recorded.

## High risks and mitigations

| Risk                                        | Initial risk | Required mitigation                                                                                                                                                        | Residual approval     |
| ------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Exposure of intimate reference media        | Critical     | Application-layer AES-256-GCM encryption before private object storage, least privilege, key separation, tested deletion/restore                                           | Security + Privacy    |
| Monitoring a person without authority       | Critical     | Identity/rights verification, consent record, abuse detection, suspension workflow                                                                                         | Trust & Safety        |
| False match or wrongful takedown            | High         | Thresholds, per-file authority declaration, restricted supporting record, operator review, exact creator-approved notice hash, counter-notice and appeal                   | Legal + Operations    |
| Special-category/biometric inference        | Critical     | Disabled by default; separate DPIA and Article 9 approval                                                                                                                  | DPO/Counsel           |
| Cross-border processor access               | High         | DPA, transfer assessment and minimum-data configuration                                                                                                                    | Privacy               |
| New inference or exposure from video frames | Critical     | Separate fail-closed approval, maximum three frames, local memory-only decode, metadata/audio exclusion, bounded duration, updated transparency and provider authorization | Privacy + Security    |
| Retention beyond need                       | High         | Automated schedule, tombstones, quarterly deletion test                                                                                                                    | Privacy + Engineering |
| Account takeover / cross-site request abuse | High         | Verification, rate limits, secure cookies, fail-closed origin validation, implemented TOTP/recovery codes and alerting                                                     | Security              |

## Consultation and approval still required

- Verified adult creators representing different risk profiles.
- UK privacy/copyright counsel and designated privacy owner.
- Security assessment and penetration test.
- Final provider architecture, data flows and transfer assessments.
- Counsel-approved Privacy Notice and Service Terms wording for derived video frames before setting `TINEYE_VIDEO_FRAME_APPROVAL_REFERENCE`.
- Signed executive acceptance of residual risks before enabling live mode.
