export function backupTiersForDate(
  value = new Date(),
  { forceMonthly = false } = {},
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid backup date.");
  return date.getUTCDate() === 1 || forceMonthly
    ? ["daily", "monthly"]
    : ["daily"];
}

export function backupRestoreDrillDue(
  value = new Date(),
  { verifiedRecently = false, force = false } = {},
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid backup date.");
  const quarterlyWindow =
    date.getUTCDate() === 1 && [0, 3, 6, 9].includes(date.getUTCMonth());
  return force || !verifiedRecently || quarterlyWindow;
}
