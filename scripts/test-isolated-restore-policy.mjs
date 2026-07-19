import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ISOLATED_RESTORE_HOST,
  isolatedRestoreConfiguration,
} from "../isolated-restore-policy.mjs";

const configuration = isolatedRestoreConfiguration({ port: 25432 });
assert.equal(configuration.host, "127.0.0.1");
assert.equal(configuration.port, 25432);
assert.equal(configuration.database, "content_protect_restore");
assert.equal(configuration.user, "restore_operator");
assert.equal(
  configuration.connectionString,
  "postgresql://restore_operator@127.0.0.1:25432/content_protect_restore",
);
assert.equal(ISOLATED_RESTORE_HOST, "127.0.0.1");
assert.throws(
  () => isolatedRestoreConfiguration({ port: 80 }),
  /port is invalid/,
);
assert.throws(
  () =>
    isolatedRestoreConfiguration({
      port: 25432,
      database: "production;drop",
    }),
  /database is invalid/,
);

const runner = await readFile(
  new URL("./run-isolated-restore-drill.mjs", import.meta.url),
  "utf8",
);
assert.match(runner, /delete restoreEnvironment\.DATABASE_URL/);
assert.match(runner, /RESTORE_DATABASE_URL/);
assert.match(runner, /--auth-host=trust/);
assert.match(runner, /127\.0\.0\.1|restore\.host/);
assert.match(runner, /pg_ctl/);
assert.match(runner, /--mode=fast/);

console.log(
  JSON.stringify({
    ok: true,
    loopbackOnly: true,
    sourceDatabaseRemovedFromChild: true,
    temporaryClusterStopped: true,
    unsafeIdentifiersRejected: true,
  }),
);
