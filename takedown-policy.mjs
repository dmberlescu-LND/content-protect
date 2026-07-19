import { createHash } from "node:crypto";

export function textDigest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function noticeText(caseRecord, creator) {
  const rightsReview = caseRecord.noticeDraft?.rightsReview,
    professionalName = creator.stageName
      ? `\nProfessional name: ${creator.stageName}`
      : "";
  return `Copyright removal request

Case reference: ${caseRecord.id}
Claimant: ${creator.name}${professionalName}
Rights holder: ${rightsReview?.rightsHolderName || "Not prepared"}
Claimant capacity: ${rightsReview?.roleLabel || "Not prepared"}
Recipient: ${caseRecord.recipientEmail || "Not prepared"}
Recipient verification source: ${caseRecord.recipientSource || "Not prepared"}
Jurisdiction/channel reviewed: ${caseRecord.jurisdiction || "Not prepared"}
Legal basis/channel: ${caseRecord.legalBasis || "Not prepared"}
Unauthorised material: ${caseRecord.targetUrl}
Evidence integrity SHA-256: ${caseRecord.evidenceHash}

The claimant has confirmed that they own or are authorised to represent the rights, have a good-faith belief that the identified use is unauthorised, and that the supplied information is accurate.

Please remove or disable access to the identified material and preserve relevant records in accordance with applicable law and your platform policies.

Please reply to Content Protect Legal quoting the case reference above.

Content Protect is operated by White Eagles Digital Marketing LTD, company number 14978662, England and Wales.`;
}

export function exactNoticeApproved({
  renderedNotice,
  preparedNoticeHash,
  creatorApprovedNoticeHash,
  submittedNoticeHash,
}) {
  const currentHash = textDigest(renderedNotice);
  return Boolean(
    preparedNoticeHash === currentHash &&
    creatorApprovedNoticeHash === currentHash &&
    submittedNoticeHash === currentHash,
  );
}
