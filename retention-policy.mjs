export function accountDeletionBlockedByLegalHold(state, userId) {
  return (state.cases || []).some(
    (item) => item.userId === userId && item.legalHold === true,
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
      item.assetId === assetId &&
      heldMatchIds.has(item.id),
  );
}
