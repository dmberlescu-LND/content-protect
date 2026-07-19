export const CONTENT_RIGHTS_ROLES = Object.freeze({
  "copyright-owner": "Copyright owner",
  "authorised-agent": "Authorised agent for the rights holder",
  "exclusive-licensee": "Exclusive licensee authorised to enforce",
});

export class ContentRightsError extends Error {
  constructor(message) {
    super(message);
    this.name = "ContentRightsError";
    this.status = 400;
  }
}

function singleLine(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function optionalHttpsUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname
    )
      throw new Error("unsafe");
    url.hash = "";
    return url.href;
  } catch {
    throw new ContentRightsError(
      "The original-publication URL must be a valid HTTPS address.",
    );
  }
}

export function contentRightsDeclaration(
  input,
  { version, declaredAt = new Date().toISOString() } = {},
) {
  const role = singleLine(input?.rightsRole, 40),
    rightsHolderName = singleLine(input?.rightsHolderName, 120),
    workTitle = singleLine(input?.workTitle, 160) || null,
    authorityEvidenceReference = singleLine(
      input?.authorityEvidenceReference,
      200,
    ),
    originalPublicationUrl = optionalHttpsUrl(input?.originalPublicationUrl);
  if (!Object.hasOwn(CONTENT_RIGHTS_ROLES, role))
    throw new ContentRightsError("Select your legal relationship to the work.");
  if (rightsHolderName.length < 2)
    throw new ContentRightsError(
      "Enter the legal or business name of the rights holder.",
    );
  if (authorityEvidenceReference.length < 3)
    throw new ContentRightsError(
      "Add a short reference to the source file, original post, licence or agency agreement.",
    );
  if (
    input?.confirmRightsAuthority !== true ||
    input?.confirmRightsAccurate !== true
  )
    throw new ContentRightsError(
      "Confirm both your authority over the work and the accuracy of this declaration.",
    );
  if (!/^\d{4}-\d{2}-\d{2}-v\d+$/.test(String(version || "")))
    throw new ContentRightsError("The rights declaration version is invalid.");
  const timestamp = new Date(declaredAt);
  if (!Number.isFinite(timestamp.getTime()))
    throw new ContentRightsError("The rights declaration time is invalid.");
  return {
    role,
    roleLabel: CONTENT_RIGHTS_ROLES[role],
    rightsHolderName,
    workTitle,
    originalPublicationUrl,
    authorityEvidenceReference,
    declarationVersion: version,
    declaredAuthority: true,
    declaredAccurate: true,
    declaredAt: timestamp.toISOString(),
  };
}

export function contentRightsRecordForAsset(records, userId, assetId) {
  return (records || [])
    .filter(
      (item) =>
        item.userId === userId &&
        item.kind === "content_rights" &&
        item.provider === "creator-attestation" &&
        item.providerReference === assetId &&
        ["pending", "verified"].includes(item.status),
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt) -
        new Date(a.updatedAt || a.createdAt),
    )[0];
}

export function contentRightsSnapshot(record) {
  if (!record?.evidence) return null;
  const evidence = record.evidence;
  if (
    !Object.hasOwn(CONTENT_RIGHTS_ROLES, evidence.role) ||
    !evidence.rightsHolderName ||
    !evidence.authorityEvidenceReference
  )
    return null;
  return {
    recordId: record.id,
    status: record.status,
    role: evidence.role,
    roleLabel: CONTENT_RIGHTS_ROLES[evidence.role],
    rightsHolderName: evidence.rightsHolderName,
    workTitle: evidence.workTitle || null,
    originalPublicationUrl: evidence.originalPublicationUrl || null,
    authorityEvidenceReference: evidence.authorityEvidenceReference,
    declarationVersion: evidence.declarationVersion,
    declaredAt: evidence.declaredAt || record.createdAt,
  };
}

export function contentRightsReview(
  declaration,
  {
    confirmed,
    reviewReference,
    operatorId,
    reviewedAt = new Date().toISOString(),
  } = {},
) {
  const reference = singleLine(reviewReference, 200),
    reviewer = singleLine(operatorId, 100),
    timestamp = new Date(reviewedAt);
  if (!declaration)
    throw new ContentRightsError("The per-file rights declaration is missing.");
  if (confirmed !== true || reference.length < 3 || reviewer.length < 2)
    throw new ContentRightsError(
      "A confirmed operator review and restricted evidence reference are required.",
    );
  if (!Number.isFinite(timestamp.getTime()))
    throw new ContentRightsError("The rights review time is invalid.");
  return {
    declarationRecordId: declaration.recordId,
    role: declaration.role,
    roleLabel: declaration.roleLabel,
    rightsHolderName: declaration.rightsHolderName,
    reviewReference: reference,
    operatorId: reviewer,
    reviewedAt: timestamp.toISOString(),
  };
}
