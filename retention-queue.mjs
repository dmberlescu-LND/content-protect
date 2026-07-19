export const RETENTION_DELETE_BATCH_SIZE = 100;
export const RETENTION_DELETE_RUN_LIMIT = 10_000;

export class RetentionObjectDeletionError extends Error {
  constructor(stats) {
    super(
      `Retention object deletion is incomplete (${stats.failed} failed, ${stats.pending} pending).`,
    );
    this.name = "RetentionObjectDeletionError";
    this.code = "RETENTION_OBJECT_DELETION_INCOMPLETE";
    this.stats = stats;
  }
}

export async function drainObjectDeletionQueue({
  claimBatch,
  deleteObject,
  markDeleted,
  markFailed,
  pendingCount,
  batchSize = RETENTION_DELETE_BATCH_SIZE,
  maxObjects = RETENTION_DELETE_RUN_LIMIT,
}) {
  for (const [name, value] of Object.entries({
    claimBatch,
    deleteObject,
    markDeleted,
    markFailed,
    pendingCount,
  }))
    if (typeof value !== "function")
      throw new TypeError(`${name} must be a function.`);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1_000)
    throw new RangeError("Retention batch size must be between 1 and 1000.");
  if (!Number.isSafeInteger(maxObjects) || maxObjects < batchSize)
    throw new RangeError("Retention run limit must cover at least one batch.");

  const stats = { claimed: 0, deleted: 0, failed: 0, pending: 0 };
  while (stats.claimed < maxObjects) {
    const remaining = maxObjects - stats.claimed,
      rows = await claimBatch(Math.min(batchSize, remaining));
    if (!Array.isArray(rows))
      throw new TypeError("claimBatch must return an array.");
    if (!rows.length) break;
    stats.claimed += rows.length;
    for (const row of rows) {
      try {
        await deleteObject(row.objectKey);
        await markDeleted(row.id);
        stats.deleted += 1;
      } catch (error) {
        await markFailed(row.id, error);
        stats.failed += 1;
      }
    }
  }
  stats.pending = Number(await pendingCount());
  if (stats.failed || stats.pending)
    throw new RetentionObjectDeletionError(stats);
  return stats;
}
