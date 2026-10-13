import type { Measurement, Thresholds } from "../geometry/measurements";
import type { Box } from "../ml/detection";

export interface AppConfig {
  thresholds: Thresholds;
  threshold_version: string;
  notice_version: string;
}

export type EventOutcome = "face" | "no_face" | "load_failure" | "error";

export interface DetectionEvent {
  model_version: string | null;
  backend: string | null;
  outcome: EventOutcome;
  load_ms: number | null;
  inference_ms: number | null;
}

export type XY = [number, number];

export interface UploadMetadata {
  orientation: number;
  detector_box: Box;
  final_box: Box;
  model_landmarks: XY[];
  user_landmarks: XY[];
  moved_flags: boolean[];
  model_measurements: Measurement[];
  user_measurements: Measurement[];
  model_version: string;
  threshold_version: string;
  geometry_version: string;
  notice_version: string;
}

export interface UploadSummary {
  id: string;
  created_at: string;
  model_version: string;
  user_measurements: Measurement[];
}

export interface UploadDetail extends UploadSummary {
  metadata: UploadMetadata;
}

export interface SaveResult {
  id: string;
}

/** Every backend call the app makes. Real (HTTP) and mock implementations share it. */
export interface ApiService {
  getConfig(): Promise<AppConfig>;
  postConsent(noticeVersion: string): Promise<void>;
  /** Fire-and-forget; never throws. */
  postEvent(event: DetectionEvent): void;
  saveUpload(image: Blob, metadata: UploadMetadata): Promise<SaveResult>;
  listUploads(): Promise<UploadSummary[]>;
  getUpload(id: string): Promise<UploadDetail>;
  getUploadImage(id: string): Promise<Blob>;
  deleteUpload(id: string): Promise<void>;
}
