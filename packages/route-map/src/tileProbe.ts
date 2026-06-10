/**
 * Basemap spike scaffolding (#60) — REMOVE once the spike is resolved.
 *
 * Answers the gating unknown for a native basemap: does the Claude host
 * actually allow fetches to an origin the server allowlisted via
 * `_meta.ui.csp.connectDomains`? The probe fetches OpenFreeMap's Liberty
 * style JSON (same origin as its tiles, glyphs, and sprites, so one fetch is
 * representative) and reports the outcome in a badge under the map. Open the
 * route map in Claude desktop and iOS and read the badge.
 */

export const TILE_PROBE_ENABLED = true;

const TILE_ORIGIN = "https://tiles.openfreemap.org";
const STYLE_URL = `${TILE_ORIGIN}/styles/liberty`;
const PROBE_TIMEOUT_MS = 8000;

export interface TileProbeResult {
  ok: boolean;
  /** Human-readable outcome for the badge. */
  detail: string;
}

export async function runTileProbe(
  fetchFn: typeof fetch = fetch,
): Promise<TileProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetchFn(STYLE_URL, {
      mode: "cors",
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        detail: `origin reachable but style request failed (HTTP ${response.status})`,
      };
    }
    const style = (await response.json()) as {
      name?: string;
      layers?: unknown[];
    };
    return {
      ok: true,
      detail: `fetched style "${style.name ?? "liberty"}" (${
        style.layers?.length ?? 0
      } layers) from ${TILE_ORIGIN}`,
    };
  } catch (error) {
    const aborted =
      error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      detail: aborted
        ? `timed out after ${PROBE_TIMEOUT_MS}ms (likely blocked without a CSP violation)`
        : `blocked: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
