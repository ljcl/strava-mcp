export const summarySegment = {
  id: 12345,
  name: "Box Hill Climb",
  activity_type: "Ride",
  distance: 2500.0,
  average_grade: 5.5,
  maximum_grade: 12.0,
  elevation_high: 224.0,
  elevation_low: 100.0,
  start_latlng: [51.2563, -0.3117],
  end_latlng: [51.2601, -0.3089],
  climb_category: 3,
  city: "Dorking",
  state: "Surrey",
  country: "United Kingdom",
  private: false,
  starred: true,
};

export const segmentWithNullOptionals = {
  ...summarySegment,
  id: 12346,
  elevation_high: null,
  elevation_low: null,
  start_latlng: null,
  end_latlng: null,
  climb_category: null,
  city: null,
  state: null,
  country: null,
};

export const detailedSegment = {
  ...summarySegment,
  id: 12347,
  created_at: "2015-06-01T10:00:00Z",
  updated_at: "2026-01-10T12:00:00Z",
  total_elevation_gain: 124.0,
  map: {
    id: "s12347",
    summary_polyline: "xyz789",
    resource_state: 2,
  },
  effort_count: 150000,
  athlete_count: 50000,
  hazardous: false,
  star_count: 2500,
};
