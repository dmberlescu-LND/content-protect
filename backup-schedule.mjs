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
