/**
 * Minimal GPX track-point reader, the counterpart to `gpxBuilder.ts`.
 *
 * Only exists for one fallback: a saved route created before Strava stored a
 * profile answers `/routes/{id}/streams` with a 404, but its GPX export still
 * carries `<ele>` on every track point. Pulling the elevation back out of that
 * export is the difference between a route preview and an apology. Regex rather
 * than an XML parser for the same reason `gpxBuilder` templates strings: the
 * shape is fixed, and the server takes no dependency for it. Kept free of
 * fetch/fs so it unit-tests next to `polyline.ts`.
 */

export interface GpxTrackPoint {
  lat: number;
  lng: number;
  /** Metres, or null when the point carries no `<ele>`. */
  ele: number | null;
}

/** `<trkpt …>…</trkpt>` and the self-closing form. */
const TRKPT_RE = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
const LAT_RE = /\blat\s*=\s*"([^"]*)"/;
const LON_RE = /\blon\s*=\s*"([^"]*)"/;
const ELE_RE = /<ele>\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*<\/ele>/;

/**
 * Every track point in document order. Points without usable coordinates are
 * skipped; a point without `<ele>` is kept with a null elevation so callers can
 * see that the export has geometry but no profile.
 */
export function parseGpxTrackPoints(gpx: string): GpxTrackPoint[] {
  const points: GpxTrackPoint[] = [];
  // `exec` in a loop with a /g regex: reset in case the literal is reused.
  TRKPT_RE.lastIndex = 0;
  let match: RegExpExecArray | null = TRKPT_RE.exec(gpx);
  while (match !== null) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    const lat = Number(LAT_RE.exec(attributes)?.[1]);
    const lng = Number(LON_RE.exec(attributes)?.[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const rawEle = ELE_RE.exec(body)?.[1];
      const ele = rawEle === undefined ? Number.NaN : Number(rawEle);
      points.push({ lat, lng, ele: Number.isFinite(ele) ? ele : null });
    }
    match = TRKPT_RE.exec(gpx);
  }
  return points;
}
