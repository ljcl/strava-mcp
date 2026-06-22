// MapLibre's CSP build (a pre-built, self-contained worker bundle) ships no own
// type declarations, so point the deep import at maplibre-gl's public surface.
// See BasemapView.tsx for why the CSP build is used under vite-plugin-singlefile.
declare module "maplibre-gl/dist/maplibre-gl-csp" {
  export * from "maplibre-gl";
}
