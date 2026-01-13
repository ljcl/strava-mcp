export const basicRoute = {
  athlete: { id: 123456, resource_state: 1 },
  description: "A scenic route through the countryside",
  distance: 50000.0,
  elevation_gain: 500.0,
  id: 54321,
  id_str: "54321",
  map: {
    id: "r54321",
    summary_polyline: "routePolylineEncoded",
    resource_state: 2,
  },
  map_urls: {
    retina_url: "https://example.com/route_retina.png",
    url: "https://example.com/route.png",
  },
  name: "Sunday Long Ride",
  private: false,
  resource_state: 3,
  starred: true,
  sub_type: 1, // road
  type: 1, // ride
  created_at: "2025-06-15T10:00:00Z",
  updated_at: "2026-01-10T14:00:00Z",
  estimated_moving_time: 7200,
  segments: null,
  timestamp: 1736517600,
};

export const routeWithNullOptionals = {
  ...basicRoute,
  id: 54322,
  id_str: "54322",
  description: null,
  elevation_gain: null,
  map_urls: null,
  estimated_moving_time: null,
  timestamp: null,
};

export const runningRoute = {
  ...basicRoute,
  id: 54323,
  id_str: "54323",
  name: "Morning 10K Loop",
  distance: 10000.0,
  elevation_gain: 50.0,
  sub_type: 4, // trail
  type: 2, // run
  estimated_moving_time: 3000,
};
