export const ISOLATED_RESTORE_HOST = "127.0.0.1";

export function isolatedRestoreConfiguration({
  port,
  database = "content_protect_restore",
  user = "restore_operator",
} = {}) {
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
    throw new Error("The isolated restore port is invalid.");
  for (const [label, value] of [
    ["database", database],
    ["user", user],
  ])
    if (!/^[a-z][a-z0-9_]{2,62}$/.test(String(value || "")))
      throw new Error(`The isolated restore ${label} is invalid.`);
  return {
    host: ISOLATED_RESTORE_HOST,
    port,
    database,
    user,
    connectionString: `postgresql://${encodeURIComponent(user)}@${ISOLATED_RESTORE_HOST}:${port}/${encodeURIComponent(database)}`,
  };
}
