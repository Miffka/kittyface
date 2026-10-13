import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, ApiError, type EventOutcome, type UploadMetadata } from "@/api/client";
import { detectBox, detectLandmarks, type Box, type LoadResult, type Point } from "@/ml/detection";
import { GEOMETRY_VERSION, measure } from "@/geometry/measurements";
import { readOrientation, stripMetadata, uprightBitmap, validateImageFile } from "@/lib/image";
import { useApp } from "@/state/app";
import { Button } from "@/components/ui/button";
import { Editor } from "./Editor";
import { ModelLoader } from "./ModelLoader";
import { ResultsPanel, type SaveState } from "./ResultsPanel";
import { UploadZone } from "./UploadZone";

type Phase =
  | { s: "empty" }
  | { s: "loading" }
  | { s: "ready" }
  | { s: "noface" }
  | { s: "error"; msg: string };

interface Session {
  file: File;
  orientation: number;
  bitmap: ImageBitmap;
  model: LoadResult;
  detectorBox: Box;
  box: Box;
  detected: Point[];
  landmarks: Point[];
  moved: boolean[];
}

const toXY = (pts: Point[]): [number, number][] => pts.map((p) => [p.x, p.y]);

export function Workspace() {
  const { config, ensureModels, loadMs } = useApp();
  const [phase, setPhase] = useState<Phase>({ s: "empty" });
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [save, setSave] = useState<SaveState>({ s: "idle" });

  useEffect(() => {
    ensureModels().catch(() => undefined);
  }, [ensureModels]);

  const sendEvent = (model: LoadResult | null, outcome: EventOutcome, inferenceMs: number | null) =>
    api.postEvent({
      model_version: model?.modelVersion ?? null,
      backend: model?.backend ?? null,
      outcome,
      load_ms: loadMs(),
      inference_ms: inferenceMs,
    });

  async function handleFile(file: File) {
    setSave({ s: "idle" });
    setSession(null);
    const invalid = validateImageFile(file);
    if (invalid) {
      setPhase({ s: "error", msg: invalid });
      return;
    }
    setPhase({ s: "loading" });
    let bitmap: ImageBitmap;
    let stripped: File;
    let orientation: number;
    try {
      const buf = await file.arrayBuffer();
      orientation = readOrientation(buf);
      stripped = new File([stripMetadata(buf)], file.name, { type: file.type });
      bitmap = await uprightBitmap(stripped, orientation);
    } catch {
      setPhase({ s: "error", msg: "This photo could not be read." });
      return;
    }
    let model: LoadResult;
    try {
      model = await ensureModels();
    } catch {
      setPhase({ s: "error", msg: "The detection models could not be loaded. Use Retry above, then try again." });
      return;
    }
    const t0 = performance.now();
    try {
      const box = await detectBox(bitmap);
      if (!box) {
        sendEvent(model, "no_face", performance.now() - t0);
        setPhase({ s: "noface" });
        return;
      }
      const landmarks = await detectLandmarks(bitmap, box);
      sendEvent(model, "face", performance.now() - t0);
      setSession({
        file: stripped,
        orientation,
        bitmap,
        model,
        detectorBox: box,
        box,
        detected: landmarks,
        landmarks,
        moved: landmarks.map(() => false),
      });
      setPhase({ s: "ready" });
    } catch {
      sendEvent(model, "error", performance.now() - t0);
      setPhase({ s: "error", msg: "Detection failed on this photo." });
    }
  }

  const redetect = async (box: Box) => {
    if (!session) return;
    setBusy(true);
    const t0 = performance.now();
    try {
      const lm = await detectLandmarks(session.bitmap, box);
      sendEvent(session.model, "face", performance.now() - t0);
      setSession({ ...session, box, detected: lm, landmarks: lm, moved: lm.map(() => false) });
      setSave({ s: "idle" });
    } catch {
      sendEvent(session.model, "error", performance.now() - t0);
    } finally {
      setBusy(false);
    }
  };

  const userMeasurements = useMemo(
    () => (session && config ? measure(session.landmarks, config.thresholds) : null),
    [session, config],
  );

  const onSave = async () => {
    if (!session || !config || !userMeasurements) return;
    setSave({ s: "saving" });
    const metadata: UploadMetadata = {
      orientation: session.orientation,
      detector_box: session.detectorBox,
      final_box: session.box,
      model_landmarks: toXY(session.detected),
      user_landmarks: toXY(session.landmarks),
      moved_flags: session.moved,
      model_measurements: measure(session.detected, config.thresholds),
      user_measurements: userMeasurements,
      model_version: session.model.modelVersion,
      threshold_version: config.threshold_version,
      geometry_version: GEOMETRY_VERSION,
      notice_version: config.notice_version,
    };
    try {
      const res = await api.saveUpload(session.file, metadata);
      setSave({ s: "saved", id: res.id });
    } catch (e) {
      setSave({ s: "error", msg: e instanceof ApiError ? e.message : "Something went wrong. Please try again." });
    }
  };

  const reset = () => {
    setPhase({ s: "empty" });
    setSession(null);
    setSave({ s: "idle" });
  };

  return (
    <div className={`mx-auto max-w-7xl px-4 py-4 ${phase.s === "ready" ? "pb-36 lg:pb-4" : ""}`}>
      <div className="mb-3">
        <ModelLoader />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {phase.s === "empty" && <UploadZone onFile={handleFile} />}
          {phase.s === "loading" && (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border bg-card lg:h-[72vh]" role="status">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
              <p className="text-sm text-muted-foreground">Finding the cat's face…</p>
            </div>
          )}
          {(phase.s === "error" || phase.s === "noface") && (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-lg border bg-card p-6 text-center lg:h-[72vh]" role="alert">
              <p className="max-w-md text-base">
                {phase.s === "noface" ? "No cat face found in this photo" : phase.msg}
              </p>
              <Button onClick={reset}>Try another photo</Button>
            </div>
          )}
          {phase.s === "ready" && session && (
            <>
              <Editor
                bitmap={session.bitmap}
                box={session.box}
                landmarks={session.landmarks}
                detected={session.detected}
                moved={session.moved}
                busy={busy}
                onLandmarksChange={(landmarks, moved) => {
                  setSession((s) => (s ? { ...s, landmarks, moved } : s));
                  setSave((v) => (v.s === "saved" || v.s === "error" ? { s: "idle" } : v));
                }}
                onBoxRedetect={redetect}
                onResetLandmarks={() =>
                  setSession((s) => (s ? { ...s, landmarks: s.detected, moved: s.detected.map(() => false) } : s))
                }
              />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{session.moved.filter(Boolean).length} of 48 points moved by hand</span>
                <button className="underline hover:text-foreground" onClick={reset}>New photo</button>
              </div>
            </>
          )}
        </div>
        <div>
          <ResultsPanel
            measurements={userMeasurements}
            versions={{
              model: session?.model.modelVersion ?? "—",
              threshold: config?.threshold_version ?? "—",
              geometry: GEOMETRY_VERSION,
            }}
            save={
              phase.s === "ready"
                ? { state: save, onSave: () => void onSave(), disabled: !session || busy }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
