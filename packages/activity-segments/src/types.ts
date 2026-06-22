export interface SegmentEffortRow {
  name: string;
  segmentId: string;
  distanceMeters: number;
  elapsedTime: number;
  movingTime: number;
  averageGrade: number;
  maximumGrade: number;
  climbCategory: number | null;
  prRank: number | null;
  komRank: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  averageWatts: number | null;
  deviceWatts: boolean | null;
  averageCadence: number | null;
  startIndex: number | null;
}

export interface ActivitySegmentsData {
  id: string;
  name: string;
  activityType: string | null;
  startDateLocal: string;
  segments: SegmentEffortRow[];
}

export interface ToolArgs {
  activity_id?: string;
}
