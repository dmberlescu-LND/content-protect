import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  drainObjectDeletionQueue,
  RetentionObjectDeletionError,
} from "../retention-queue.mjs";
import {
  accountDeletionBlockedByLegalHold,
  assetDeletionBlockedByLegalHold,
} from "../retention-policy.mjs";

const records = [
    { id: 1, objectKey: "user/one.vault", state: "pending", attempts: 0 },
    { id: 2, objectKey: "user/two.vault", state: "pending", attempts: 0 },
    { id: 3, objectKey: "user/three.vault", state: "pending", attempts: 0 },
  ],
  failedOnce = new Set(),
  attemptedThisRun = new Set();

const adapter = () => ({
  claimBatch: async (limit) =>
    records
      .filter(
        (record) =>
          record.state === "pending" && !attemptedThisRun.has(record.id),
      )
      .slice(0, limit)
      .map((record) => {
        attemptedThisRun.add(record.id);
        record.attempts += 1;
        return record;
      }),
  deleteObject: async (objectKey) => {
    if (objectKey.endsWith("two.vault") && !failedOnce.has(objectKey)) {
      failedOnce.add(objectKey);
      throw new Error("simulated provider failure");
    }
  },
  markDeleted: async (id) => {
    records.find((record) => record.id === id).state = "deleted";
  },
  markFailed: async (id, error) => {
    assert.match(error.message, /provider failure/);
    records.find((record) => record.id === id).state = "pending";
  },
  pendingCount: async () =>
    records.filter((record) => record.state === "pending").length,
  batchSize: 2,
  maxObjects: 10,
});

await assert.rejects(drainObjectDeletionQueue(adapter()), (error) => {
  assert.ok(error instanceof RetentionObjectDeletionError);
  assert.deepEqual(error.stats, {
    claimed: 3,
    deleted: 2,
    failed: 1,
    pending: 1,
  });
  return true;
});
assert.deepEqual(
  records.map(({ state, attempts }) => ({ state, attempts })),
  [
    { state: "deleted", attempts: 1 },
    { state: "pending", attempts: 1 },
    { state: "deleted", attempts: 1 },
  ],
);

attemptedThisRun.clear();
const retry = await drainObjectDeletionQueue(adapter());
assert.deepEqual(retry, {
  claimed: 1,
  deleted: 1,
  failed: 0,
  pending: 0,
});
assert.equal(records[1].attempts, 2);

await assert.rejects(
  drainObjectDeletionQueue({ ...adapter(), batchSize: 0 }),
  /batch size/i,
);

const migration = await readFile(
    new URL("../db/migrations/018_retention_object_queue.sql", import.meta.url),
    "utf8",
  ),
  databaseSource = await readFile(
    new URL("../database.mjs", import.meta.url),
    "utf8",
  ),
  serverSource = await readFile(
    new URL("../server.mjs", import.meta.url),
    "utf8",
  );
assert.match(migration, /object_deletion_queue/);
assert.match(migration, /WHERE deleted_at IS NULL/);
assert.match(databaseSource, /FOR UPDATE SKIP LOCKED/);
assert.match(databaseSource, /status: "failed"/);
assert.doesNotMatch(
  databaseSource,
  /FROM operational_evidence\s+WHERE status='succeeded'/,
);
assert.doesNotMatch(databaseSource, /DELETE FROM users WHERE NOT/);
assert.match(databaseSource, /deletedUserIds = \[\]/);
assert.match(databaseSource, /deletedAssetIds = \[\]/);
assert.match(serverSource, /objectDeletions: \[objectKey\]/);
assert.match(serverSource, /deletedUserIds: \[u\.id\]/);

const heldState = {
  cases: [
    { userId: "user-1", matchId: "match-1", legalHold: true },
    { userId: "user-2", matchId: "match-2", legalHold: false },
  ],
  matches: [
    { id: "match-1", userId: "user-1", assetId: "asset-1" },
    { id: "match-2", userId: "user-2", assetId: "asset-2" },
  ],
};
assert.equal(accountDeletionBlockedByLegalHold(heldState, "user-1"), true);
assert.equal(accountDeletionBlockedByLegalHold(heldState, "user-2"), false);
assert.equal(
  assetDeletionBlockedByLegalHold(heldState, "user-1", "asset-1"),
  true,
);
assert.equal(
  assetDeletionBlockedByLegalHold(heldState, "user-2", "asset-2"),
  false,
);

console.log(
  JSON.stringify({
    ok: true,
    persistentQueueRetryVerified: true,
    partialFailureFailsClosed: true,
    latestFailureClosesReadiness: true,
    legalHoldBlocksDeletion: true,
    explicitDeletionIntentRequired: true,
  }),
);
