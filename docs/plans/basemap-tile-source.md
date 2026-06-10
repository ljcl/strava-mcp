# Basemap spike: host CSP + free tile source (#60)

> **Spike resolved (June 2026).** The Claude host honors the allowlist on
> **both desktop/web and iOS**: the probe fetched the Liberty style through
> the sandbox on each. The probe scaffolding has been removed; the basemap
> itself shipped with #61 (MapLibre + OpenFreeMap behind a toggle, off by
> default). Measured single-file bundle impact: app.html ~658 KB → ~1.73 MB
> raw (~172 KB → ~447 KB gz). The rest of this doc is the original spike
> writeup.

Gating spike for the native basemap epic (#59). Two questions:

1. **Does the Claude host honor `_meta.ui.csp` allowlists for external tile
   fetches?** MCP App iframes block external connections by default; the
   server can declare `csp.connectDomains` / `csp.resourceDomains` on the UI
   resource, but the host must enforce them through its double-iframe sandbox.
2. **Which free tile source should the basemap (#61) standardize on?**

## What this spike wires up

- The route-map resource declares `_meta.ui.csp` (verified against
  `@modelcontextprotocol/ext-apps` 1.7.4's `McpUiResourceCspSchema`:
  `connectDomains`, `resourceDomains`, `frameDomains`, `baseUriDomains`) on
  **both** the resource descriptor and the ReadResource content response:

  ```jsonc
  { "ui": { "prefersBorder": false, "csp": {
    "connectDomains": ["https://tiles.openfreemap.org"],
    "resourceDomains": ["https://tiles.openfreemap.org"]
  } } }
  ```

- The app runs a one-shot probe on mount (`src/tileProbe.ts`): a CORS fetch of
  OpenFreeMap's Liberty style JSON (`https://tiles.openfreemap.org/styles/liberty`).
  Styles, tiles, glyphs, and sprites are all served from that one origin, so a
  single fetch is representative of everything MapLibre would request.
- The outcome renders as a badge under the map ("Basemap tile probe: ✓ / ✗ …").

## How to resolve the spike

1. Run this branch's server (`cd apps/server && bun run start` + tunnel, or a
   container built from the branch) and connect it to Claude.
2. Ask for a route map (`view-route-map`) in **Claude desktop/web** and in
   **Claude iOS**; read the badge on each.
3. Record the yes/no per platform on #60. If ✓, #61 is unblocked; if ✗, note
   the failure detail (CSP violation vs timeout) — a timeout with no violation
   usually means the host stripped the allowlist rather than the network failing.
4. Remove the probe (`tileProbe.ts`, the badge in `main.tsx`) when #61 lands
   or the spike concludes negative. The CSP declaration can stay: it is inert
   while the app makes no external requests.

## Tile source comparison

| | OpenFreeMap (public instance) | Protomaps PMTiles (self-hosted on R2) |
| --- | --- | --- |
| Cost | $0 — no API key, no usage limits, no registration ([openfreemap.org](https://openfreemap.org/)) | ~$2–3/mo for a full planet (~120 GB) on Cloudflare R2 storage; zero egress fees ([protomaps docs](https://docs.protomaps.com/deploy/cloudflare), [pinballmap writeup](https://blog.pinballmap.com/2024/11/05/protomaps-tile-hosting/)) |
| Infra to run | None | R2 bucket + (optionally) a Worker; periodic planet re-downloads to stay current |
| Reliability | Community-funded public service; no SLA, but fully open source and self-hostable later with the same URLs swapped | Own infrastructure; as reliable as Cloudflare |
| MapLibre integration | Plain style URL (`tiles.openfreemap.org/styles/liberty`, also `positron`, `bright`) — zero extra code | `pmtiles` protocol via `maplibregl.addProtocol` + the `pmtiles` JS package ([protomaps docs](https://docs.protomaps.com/pmtiles/maplibre)) |
| CSP surface | One origin for style + tiles + glyphs + sprites | Two+ origins (R2/custom domain; style/glyphs hosting) unless everything is fronted by one domain |
| Attribution | OpenStreetMap attribution required; MapLibre's attribution control covers it | Same (OSM-derived data) |
| Latency | CDN-backed | R2 can be slower (~500 ms cold reads noted by users) unless fronted by a Worker/CDN ([bonitotech writeup](https://bonitotech.com/2024/03/19/how-we-reduced-our-mapping-costs-by-90-using-protomaps-and-cloudflare/)) |

## Recommendation

**Start with OpenFreeMap's public instance** for #61: $0, no key, no infra, a
single CSP origin, and stock MapLibre integration. Its main risk — it is a
donation-funded public service with no SLA — is acceptable because the map
falls back to the offline grid whenever tiles fail, and the project's
self-hosting path (or a Protomaps PMTiles extract on R2) remains the escape
hatch if the public instance ever degrades. Protomaps becomes the right answer
only if we want guaranteed availability or custom extracts; it costs a few
dollars a month and adds the `pmtiles` protocol shim plus another origin to
allowlist.

## Bundle-size note for #61

`maplibre-gl` is ~210 KB gzipped on its own — several times the current
route-map bundle — and the app ships as a single inlined HTML file. #61 should
measure the built `app.html` before/after and consider gating MapLibre behind
a dynamic import that only loads when the user enables the basemap toggle
(keeping first paint on the offline grid).
