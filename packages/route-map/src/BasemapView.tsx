/**
 * MapLibre basemap renderer (#61): OpenFreeMap's Liberty style behind the
 * track, the default view when tiles are reachable (the offline SVG grid is
 * the silent fallback). Owns its own camera — MapLibre's native zoom/pan with
 * cooperative gestures so the conversation keeps scrolling — and renders the
 * full feature set as map layers: the metric-colored track (GeoJSON line
 * features per color run), segment-effort halos, lap/km split dots, photo
 * pins (hover popups for their titles), and the scrub marker + value tooltip
 * shared with the elevation strip through the scrub index.
 */

import maplibregl from "maplibre-gl/dist/maplibre-gl-csp";
import workerCode from "maplibre-gl/dist/maplibre-gl-csp-worker.js?raw";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type PhotoMarker, type SplitMarker } from "./annotations";
import {
  BASEMAP_COLORS,
  nearestLatLngIndex,
  type PointFeatureCollection,
  photosToGeoJson,
  segmentsToGeoJson,
  splitsToGeoJson,
  trackBounds,
  trackToGeoJson,
} from "./basemapData";
import { type ColorRun } from "./metrics";
import styles from "./RouteMap.module.css";
import { type RouteAnnotations } from "./types";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre runs all source processing in a Web Worker. When our app is inlined
// into a single HTML file by vite-plugin-singlefile, MapLibre's default
// self-built worker loses its GeoJSON code path — the geojson-vt symbol ends up
// referenced from a scope the worker cannot see — so vector tiles still render
// but every GeoJSON overlay (the track, markers, segment halos) throws in the
// worker and silently vanishes. The CSP build ships a pre-built, self-contained
// worker; we inline it verbatim (`?raw`) as a Blob URL so it is never
// re-bundled and geojson-vt stays intact. This is also the build MapLibre
// intends for CSP-sandboxed hosts, which is exactly where this app runs.
maplibregl.setWorkerUrl(
  URL.createObjectURL(
    new Blob([workerCode], { type: "application/javascript" }),
  ),
);

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
/** If the style hasn't loaded by then, treat tiles as unavailable. */
const LOAD_TIMEOUT_MS = 12000;

/** Plain-track color when no metric is selected (matches the SVG view). */
const FALLBACK_TRACK_COLOR = "#3b82f6";

/** Annotation layer ids, in render order (halos under markers). */
const SEGMENTS_LAYER = "segment-halos";
const SPLITS_LAYER = "splits";
const PHOTOS_LAYER = "photos";
const PHOTOS_DOT_LAYER = "photos-dot";

export interface BasemapLayerVisibility {
  splits: boolean;
  segments: boolean;
  photos: boolean;
}

interface BasemapViewProps {
  coordinates: Array<[number, number]>;
  colorRuns: ColorRun[];
  /** Resolved annotation markers (already index-anchored). */
  splitMarkers: SplitMarker[];
  segments: NonNullable<RouteAnnotations["segments"]>;
  photoMarkers: PhotoMarker[];
  /** Footer legend toggles, applied as layer visibility. */
  visibility: BasemapLayerVisibility;
  mode: "mobile" | "desktop";
  scrubIndex: number | null;
  /** Scrub from map hover/tap; null clears. */
  onScrub: (index: number | null) => void;
  /** Value tooltip content for the current scrub index, rendered at the
   * scrubbed point; the caller owns the content, this view owns position. */
  scrubTip?: ReactNode;
  /** Tiles failed to load — the caller falls back to the offline grid. */
  onFail: () => void;
}

function scrubPointGeoJson(
  coordinates: Array<[number, number]>,
  index: number | null,
): PointFeatureCollection {
  const pair = index != null ? coordinates[index] : undefined;
  return {
    type: "FeatureCollection",
    features: pair
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [pair[1], pair[0]] },
          },
        ]
      : [],
  };
}

export function BasemapView({
  coordinates,
  colorRuns,
  splitMarkers,
  segments,
  photoMarkers,
  visibility,
  mode,
  scrubIndex,
  onScrub,
  scrubTip,
  onFail,
}: BasemapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  // Tooltip anchor in container pixels, recomputed on scrub and camera moves.
  const [tipPoint, setTipPoint] = useState<{ x: number; y: number } | null>(
    null,
  );

  const track = useMemo(
    () => trackToGeoJson(coordinates, colorRuns, FALLBACK_TRACK_COLOR),
    [coordinates, colorRuns],
  );

  // Latest values for handlers bound once at map creation.
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  const coordinatesRef = useRef(coordinates);
  coordinatesRef.current = coordinates;
  const trackRef = useRef(track);
  trackRef.current = track;
  const scrubIndexRef = useRef(scrubIndex);
  scrubIndexRef.current = scrubIndex;
  const annotationsRef = useRef({ splitMarkers, segments, photoMarkers });
  annotationsRef.current = { splitMarkers, segments, photoMarkers };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = trackBounds(coordinatesRef.current);
    if (!bounds) return;

    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      bounds,
      fitBoundsOptions: { padding: 36 },
      // Two-finger pan on touch, ctrl/cmd+wheel zoom on desktop: the map sits
      // inside a scrollable conversation and must not trap the scroll.
      cooperativeGestures: true,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    const failTimer = setTimeout(() => {
      if (!loadedRef.current) onFailRef.current();
    }, LOAD_TIMEOUT_MS);

    map.on("error", (e) => {
      // An error before the style itself loads means no usable basemap
      // (blocked origin, offline, bad style) — fall back. Once the style is
      // in, individual tile/sprite errors are cosmetic and must not nuke the
      // map back to the grid.
      if (!loadedRef.current && !map.isStyleLoaded()) {
        clearTimeout(failTimer);
        onFailRef.current();
      } else {
        console.warn("route-map basemap: maplibre error", e.error);
      }
    });

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
    });

    map.on("load", () => {
      loadedRef.current = true;
      clearTimeout(failTimer);

      const coords = coordinatesRef.current;
      const { splitMarkers, segments, photoMarkers } = annotationsRef.current;

      // Guard every add individually (#73): maplibre's addSource throws
      // synchronously (e.g. on a duplicate id), and an unguarded throw here
      // aborted the whole handler — one bad call blanked every layer while
      // the basemap kept rendering. Failures are logged with their id so a
      // report from the host console pins the root cause.
      const addSourceSafe = (
        id: string,
        spec: maplibregl.SourceSpecification,
      ) => {
        try {
          map.addSource(id, spec);
        } catch (error) {
          console.error(`route-map basemap: addSource "${id}" failed`, error);
        }
      };
      const addLayerSafe = (spec: maplibregl.AddLayerObject) => {
        try {
          map.addLayer(spec);
        } catch (error) {
          console.error(
            `route-map basemap: addLayer "${spec.id}" failed`,
            error,
          );
        }
      };

      // Segment halos go under the track, like the grid view.
      addSourceSafe("segments", {
        type: "geojson",
        data: segmentsToGeoJson(coords, segments),
      });
      addLayerSafe({
        id: SEGMENTS_LAYER,
        type: "line",
        source: "segments",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 10,
          "line-opacity": 0.45,
        },
      });

      addSourceSafe("track", { type: "geojson", data: trackRef.current });
      addLayerSafe({
        id: "track-casing",
        type: "line",
        source: "track",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": 6,
          "line-opacity": 0.9,
        },
      });
      addLayerSafe({
        id: "track-line",
        type: "line",
        source: "track",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 3.5 },
      });

      addSourceSafe("splits", {
        type: "geojson",
        data: splitsToGeoJson(coords, splitMarkers),
      });
      addLayerSafe({
        id: SPLITS_LAYER,
        type: "circle",
        source: "splits",
        paint: {
          "circle-radius": 4,
          "circle-color": "#ffffff",
          "circle-stroke-color": BASEMAP_COLORS.split,
          "circle-stroke-width": 2,
        },
      });

      addSourceSafe("photos", {
        type: "geojson",
        data: photosToGeoJson(coords, photoMarkers),
      });
      addLayerSafe({
        id: PHOTOS_LAYER,
        type: "circle",
        source: "photos",
        paint: {
          "circle-radius": 5.5,
          "circle-color": BASEMAP_COLORS.photo,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      addLayerSafe({
        id: PHOTOS_DOT_LAYER,
        type: "circle",
        source: "photos",
        paint: { "circle-radius": 1.75, "circle-color": "#ffffff" },
      });

      const endpoints: PointFeatureCollection = {
        type: "FeatureCollection",
        features: [
          { kind: "start", pair: coords[0] },
          { kind: "end", pair: coords[coords.length - 1] },
        ].flatMap(({ kind, pair }) =>
          pair
            ? [
                {
                  type: "Feature" as const,
                  properties: { kind },
                  geometry: {
                    type: "Point" as const,
                    coordinates: [pair[1], pair[0]] as [number, number],
                  },
                },
              ]
            : [],
        ),
      };
      addSourceSafe("endpoints", { type: "geojson", data: endpoints });
      addLayerSafe({
        id: "endpoints",
        type: "circle",
        source: "endpoints",
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match",
            ["get", "kind"],
            "start",
            "#275b19",
            "#7f2c28",
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      addSourceSafe("scrub", {
        type: "geojson",
        data: scrubPointGeoJson(coords, scrubIndexRef.current),
      });
      addLayerSafe({
        id: "scrub",
        type: "circle",
        source: "scrub",
        paint: {
          "circle-radius": 5,
          "circle-color": "#14141a",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      // Hover popups for the point markers ("Lap 2", "3 photos"). Segment
      // efforts are not here: they surface in the shared scrub tooltip instead,
      // so the white per-segment popup no longer clashes with the metric value.
      // Bound only to layers that actually got added: delegated listeners on
      // a missing layer make maplibre error on every pointer move.
      for (const layerId of [SPLITS_LAYER, PHOTOS_LAYER]) {
        if (!map.getLayer(layerId)) continue;
        map.on("mousemove", layerId, (e) => {
          const title = e.features?.[0]?.properties?.title;
          if (typeof title !== "string" || title.length === 0) return;
          map.getCanvas().style.cursor = "pointer";
          popup.setLngLat(e.lngLat).setText(title).addTo(map);
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });
      }

      // One summary line for bug reports: which overlay layers are live.
      const missing = [
        "track-line",
        "track-casing",
        "endpoints",
        "scrub",
        SEGMENTS_LAYER,
        SPLITS_LAYER,
        PHOTOS_LAYER,
      ].filter((id) => !map.getLayer(id));
      if (missing.length > 0) {
        console.error(
          `route-map basemap: ${missing.length} overlay layer(s) missing after load: ${missing.join(", ")}`,
        );
      }

      setLoaded(true);
    });

    const scrubAt = (lngLat: maplibregl.LngLat) => {
      if (!loadedRef.current) return;
      onScrubRef.current(
        nearestLatLngIndex(coordinatesRef.current, lngLat.lat, lngLat.lng),
      );
    };
    map.on("mousemove", (e) => scrubAt(e.lngLat));
    // Touch drags pan the map; a tap is the touch scrub gesture.
    map.on("click", (e) => scrubAt(e.lngLat));
    map.on("mouseout", () => onScrubRef.current(null));

    // Keep the tooltip glued to the scrubbed point while the camera moves.
    const repositionTip = () => {
      const index = scrubIndexRef.current;
      const pair = index != null ? coordinatesRef.current[index] : undefined;
      setTipPoint(pair ? map.project([pair[1], pair[0]]) : null);
    };
    map.on("move", repositionTip);

    return () => {
      clearTimeout(failTimer);
      mapRef.current = null;
      loadedRef.current = false;
      popup.remove();
      map.remove();
    };
    // The map is created once per mount; data changes remount via key.
  }, []);

  // Keep the track + scrub sources in sync without recreating the map.
  useEffect(() => {
    if (!loaded) return;
    const source = mapRef.current?.getSource<maplibregl.GeoJSONSource>("track");
    source?.setData(track);
  }, [track, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current;
    if (!map) return;
    map
      .getSource<maplibregl.GeoJSONSource>("scrub")
      ?.setData(scrubPointGeoJson(coordinates, scrubIndex));
    const pair = scrubIndex != null ? coordinates[scrubIndex] : undefined;
    setTipPoint(pair ? map.project([pair[1], pair[0]]) : null);
  }, [scrubIndex, coordinates, loaded]);

  // Footer legend toggles map onto layer visibility.
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current;
    if (!map) return;
    const apply = (layerIds: string[], visible: boolean) => {
      for (const id of layerIds) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
        }
      }
    };
    apply([SPLITS_LAYER], visibility.splits);
    apply([SEGMENTS_LAYER], visibility.segments);
    apply([PHOTOS_LAYER, PHOTOS_DOT_LAYER], visibility.photos);
  }, [visibility, loaded]);

  const containerWidth = containerRef.current?.clientWidth ?? 0;

  return (
    <div className={styles.basemapWrap}>
      <div
        ref={containerRef}
        className={styles.basemap}
        data-compact={mode === "mobile" || undefined}
      />
      {scrubTip && tipPoint && (
        <div
          className={styles.scrubTip}
          data-flip={
            (containerWidth > 0 && tipPoint.x > containerWidth * 0.55) ||
            undefined
          }
          style={{ left: tipPoint.x, top: tipPoint.y }}
        >
          {scrubTip}
        </div>
      )}
    </div>
  );
}
