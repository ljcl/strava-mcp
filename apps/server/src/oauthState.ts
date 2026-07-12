import { randomBytes } from "node:crypto";

/**
 * Single-use OAuth `state` nonces (#109). `/auth/start` mints one into the
 * authorize URL; `/auth/callback` must present it back before any code is
 * exchanged. Without this, a CSRF-ed callback carrying an attacker's code
 * could rebind the server to their Strava account. In-memory is enough:
 * a restart mid-flow just means clicking "authorize" again.
 */

const STATE_TTL_MS = 10 * 60 * 1000;

/** state → expiry (epoch ms) */
const pendingStates = new Map<string, number>();

export function createOAuthState(now = Date.now()): string {
  // Prune expired entries so abandoned flows do not accumulate.
  for (const [state, expiresAt] of pendingStates) {
    if (expiresAt <= now) pendingStates.delete(state);
  }
  const state = randomBytes(32).toString("hex");
  pendingStates.set(state, now + STATE_TTL_MS);
  return state;
}

/**
 * Returns true when the state is known and unexpired. Consuming is
 * single-use: valid or not, a presented state is deleted.
 */
export function consumeOAuthState(
  state: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!state) return false;
  const expiresAt = pendingStates.get(state);
  if (expiresAt === undefined) return false;
  pendingStates.delete(state);
  return expiresAt > now;
}
