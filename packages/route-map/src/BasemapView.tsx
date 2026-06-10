/**
 * MapLibre basemap renderer (#61): OpenFreeMap's Liberty style behind the
 * track, used when the basemap toggle is on. The offline SVG renderer remains
 * the default; this view owns its own camera (MapLibre's native zoom/pan with
 * cooperative gestures so the conversation keeps scrolling) and draws the
 * track as GeoJSON line features colored per metric run. Scrub stays in sync
 * with the elevation strip through the shared scrub index.
 */

import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import {
  nearestLatLngIndex,
  type PointFeatureCollection,
  trackBounds,
  trackToGeoJson,
} from "./basemapData";
import { type ColorRun } from "./metrics";
import styles from "./RouteMap.module.css";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
/** If the style hasn't loaded by then, treat tiles as unavailable. */
const LOAD_TIMEOUT_MS = 12000;

/** Plain-track color when no metric is selected (matches the SVG view). */
const FALLBACK_TRACK_COLOR = "#3b82f6";

interface BasemapViewProps {
  coordinates: Array<[number, number]>;
  colorRuns: ColorRun[];
  mode: "mobile" | "desktop";
  scrubIndex: number | null;
  /** Scrub from map hover; null clears. No-op when scrubbing is unavailable. */
  onScrub: (index: number | null) => void;
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
  mode,
  scrubIndex,
  onScrub,
  onFail,
}: BasemapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);

  const track = useMemo(
    () => trackToGeoJson(coordinates, colorRuns, FALLBACK_TRACK_COLOR),
    [coordinates, colorRuns],
  );

  // Latest callbacks/coords for handlers bound once at map creation.
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  const coordinatesRef = useRef(coordinates);
  coordinatesRef.current = coordinates;
  const trackRef = useRef(track);
  trackRef.current = track;

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
      // Any error before the style loads means no usable basemap (blocked
      // origin, offline, bad style). Post-load tile errors are cosmetic.
      if (!loadedRef.current) {
        clearTimeout(failTimer);
        onFailRef.current();
      } else {
        console.warn("maplibre error after load", e.error);
      }
    });

    map.on("load", () => {
      loadedRef.current = true;
      clearTimeout(failTimer);

      map.addSource("track", { type: "geojson", data: trackRef.current });
      map.addLayer({
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
      map.addLayer({
        id: "track-line",
        type: "line",
        source: "track",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 3.5 },
      });

      const coords = coordinatesRef.current;
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
      map.addSource("endpoints", { type: "geojson", data: endpoints });
      map.addLayer({
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

      map.addSource("scrub", {
        type: "geojson",
        data: scrubPointGeoJson(coords, null),
      });
      map.addLayer({
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
    });

    map.on("mousemove", (e) => {
      if (!loadedRef.current) return;
      onScrubRef.current(
        nearestLatLngIndex(coordinatesRef.current, e.lngLat.lat, e.lngLat.lng),
      );
    });
    map.on("mouseout", () => onScrubRef.current(null));

    return () => {
      clearTimeout(failTimer);
      mapRef.current = null;
      loadedRef.current = false;
      map.remove();
    };
    // The map is created once per mount; track/coords changes remount via key.
  }, []);

  // Keep the track + scrub sources in sync without recreating the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource<maplibregl.GeoJSONSource>("track");
    source?.setData(track);
  }, [track]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource<maplibregl.GeoJSONSource>("scrub");
    source?.setData(scrubPointGeoJson(coordinates, scrubIndex));
  }, [scrubIndex, coordinates]);

  return (
    <div
      ref={containerRef}
      className={styles.basemap}
      data-compact={mode === "mobile" || undefined}
    />
  );
}
