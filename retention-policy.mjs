export function accountDeletionBlockedByLegalHold(state, userId) {
  return (
    (state.cases || []).some(
      (item) => item.userId === userId && item.legalHold === true,
    ) ||
    (state.consumerCases || []).some(
      (item) =>
        item.userId === userId &&
        (item.status !== "closed" ||
          (["approved", "partial"].includes(item.refundDecision) &&
            item.refundProviderStatus !== "succeeded")),
    )
  );
}

export function assetDeletionBlockedByLegalHold(state, userId, assetId) {
  const heldMatchIds = new Set(
    (state.cases || [])
      .filter((item) => item.userId === userId && item.legalHold === true)
      .map((item) => item.matchId),
  );
  return (state.matches || []).some(
    (item) =>
      item.userId === userId &&
      (item.assetId === assetId ||
        item.evidence?.pageCapture?.assetId === assetId) &&
      heldMatchIds.has(item.id),
  );
}
