const UNSAFE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const AUTHENTICATED_MACHINE_ROUTES = new Set([
  "/api/billing/webhook",
  "/api/takedowns/webhook",
  "/api/operations/monitor-heartbeat",
  "/api/operations/backup-restore-evidence",
]);

export function unsafeRequestOriginAllowed({
  method,
  route,
  origin,
  appOrigin,
  production,
}) {
  if (!UNSAFE_METHODS.has(method)) return true;
  if (AUTHENTICATED_MACHINE_ROUTES.has(route)) return true;
  if (origin === appOrigin) return true;
  if (
    !production &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "")
  )
    return true;
  return false;
}
