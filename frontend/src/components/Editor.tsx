import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { LANDMARK_REGIONS, type Box, type Point, type Region } from "@/ml/detection";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

interface EditorProps {
  bitmap: ImageBitmap;
  box: Box;
  landmarks: Point[];
  detected: Point[];
  moved: boolean[];
  readOnly?: boolean;
  busy?: boolean;
  onLandmarksChange?: (landmarks: Point[], moved: boolean[]) => void;
  /** Called with the new box after the user confirms; parent re-detects landmarks. */
  onBoxRedetect?: (box: Box) => Promise<void>;
  onResetLandmarks?: () => void;
}

type View = { s: number; tx: number; ty: number };
type Handle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
type Drag =
  | { kind: "point"; i: number; dx: number; dy: number; touch: boolean }
  | { kind: "box"; handle: Handle; start: Box; sx: number; sy: number }
  | { kind: "pan"; tx: number; ty: number; cx: number; cy: number };
type Pinch = { dist: number; s: number; mx: number; my: number; tx: number; ty: number };

const REGION_FILL: Record<Region, string> = {
  left_ear: "fill-region-ear",
  right_ear: "fill-region-ear",
  left_eye: "fill-region-eye",
  right_eye: "fill-region-eye",
  nose_whiskers: "fill-region-nose",
};
const HANDLES: Exclude<Handle, "move">[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MIN_BOX = 8;

function handlePos(b: Box, h: Exclude<Handle, "move">): Point {
  const x = h.includes("w") ? b.x : h.includes("e") ? b.x + b.width : b.x + b.width / 2;
  const y = h.includes("n") ? b.y : h.includes("s") ? b.y + b.height : b.y + b.height / 2;
  return { x, y };
}

export function Editor({
  bitmap,
  box,
  landmarks,
  detected,
  moved,
  readOnly = false,
  busy = false,
  onLandmarksChange,
  onBoxRedetect,
  onResetLandmarks,
}: EditorProps) {
  const W = bitmap.width;
  const H = bitmap.height;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 });
  const [fitScale, setFitScale] = useState(1);
  const [mode, setMode] = useState<"landmarks" | "box">("landmarks");
  const [draftBox, setDraftBox] = useState<Box>(box);
  const boxBefore = useRef<Box>(box);
  const [showDetected, setShowDetected] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [mag, setMag] = useState<{ i: number; cx: number; cy: number } | null>(null);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<Drag | null>(null);
  const pinch = useRef<Pinch | null>(null);
  const latest = useRef({ view, landmarks, moved, draftBox });
  latest.current = { view, landmarks, moved, draftBox };

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setCoarse(mq.matches);
    const on = (e: MediaQueryListEvent) => setCoarse(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  // Draw the upright image onto the canvas.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = W;
    c.height = H;
    c.getContext("2d")?.drawImage(bitmap, 0, 0);
  }, [bitmap, W, H]);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (!width || !height) return;
    const s = Math.min(width / W, height / H) * 0.96;
    setFitScale(s);
    setView({ s, tx: (width - W * s) / 2, ty: (height - H * s) / 2 });
  }, [W, H]);

  useLayoutEffect(() => {
    fit();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const zoomAt = useCallback(
    (factor: number, mx: number, my: number) => {
      setView((v) => {
        const s = Math.min(Math.max(v.s * factor, fitScale * 0.5), fitScale * 30);
        const k = s / v.s;
        return { s, tx: mx - (mx - v.tx) * k, ty: my - (my - v.ty) * k };
      });
    },
    [fitScale],
  );

  // Wheel zoom (non-passive so the page does not scroll).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const toImage = (cx: number, cy: number): Point => {
    const r = containerRef.current?.getBoundingClientRect();
    const v = latest.current.view;
    return { x: (cx - (r?.left ?? 0) - v.tx) / v.s, y: (cy - (r?.top ?? 0) - v.ty) / v.s };
  };
  const clampPt = (p: Point): Point => ({
    x: Math.min(Math.max(p.x, 0), W),
    y: Math.min(Math.max(p.y, 0), H),
  });

  const movePoint = (i: number, p: Point) => {
    const { landmarks: lm, moved: mv } = latest.current;
    const next = lm.slice();
    next[i] = clampPt(p);
    const nextMoved = mv.slice();
    nextMoved[i] = true;
    onLandmarksChange?.(next, nextMoved);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el || busy) return;
    el.setPointerCapture(e.pointerId);
    el.focus({ preventScroll: true });
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const r = el.getBoundingClientRect();
      const v = latest.current.view;
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        s: v.s,
        mx: (a.x + b.x) / 2 - r.left,
        my: (a.y + b.y) / 2 - r.top,
        tx: v.tx,
        ty: v.ty,
      };
      drag.current = null;
      setMag(null);
      return;
    }
    if (pointers.current.size > 2) return;

    const target = e.target as Element;
    const pointAttr = target.closest("[data-point]")?.getAttribute("data-point");
    const handleAttr = target.closest("[data-handle]")?.getAttribute("data-handle") as Handle | null;
    const img = toImage(e.clientX, e.clientY);

    if (mode === "landmarks" && pointAttr != null) {
      const i = Number(pointAttr);
      setSelected(i);
      if (!readOnly) {
        const p = latest.current.landmarks[i] as Point;
        const touch = e.pointerType !== "mouse";
        drag.current = { kind: "point", i, dx: img.x - p.x, dy: img.y - p.y, touch };
        if (touch) setMag({ i, cx: e.clientX, cy: e.clientY });
        return;
      }
    } else if (mode === "box" && handleAttr) {
      drag.current = { kind: "box", handle: handleAttr, start: latest.current.draftBox, sx: img.x, sy: img.y };
      return;
    }
    const v = latest.current.view;
    drag.current = { kind: "pan", tx: v.tx, ty: v.ty, cx: e.clientX, cy: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = containerRef.current;
    if (!el) return;

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const r = el.getBoundingClientRect();
      const p = pinch.current;
      const s = Math.min(
        Math.max((p.s * Math.hypot(a.x - b.x, a.y - b.y)) / p.dist, fitScale * 0.5),
        fitScale * 30,
      );
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      const ix = (p.mx - p.tx) / p.s;
      const iy = (p.my - p.ty) / p.s;
      setView({ s, tx: mx - ix * s, ty: my - iy * s });
      return;
    }

    const d = drag.current;
    if (!d) return;
    if (d.kind === "point") {
      const img = toImage(e.clientX, e.clientY);
      movePoint(d.i, { x: img.x - d.dx, y: img.y - d.dy });
      if (d.touch) setMag({ i: d.i, cx: e.clientX, cy: e.clientY });
    } else if (d.kind === "box") {
      const img = toImage(e.clientX, e.clientY);
      const dx = img.x - d.sx;
      const dy = img.y - d.sy;
      const b = d.start;
      let { x, y, width, height } = b;
      if (d.handle === "move") {
        x = Math.min(Math.max(b.x + dx, 0), W - b.width);
        y = Math.min(Math.max(b.y + dy, 0), H - b.height);
      } else {
        if (d.handle.includes("w")) {
          x = Math.min(Math.max(b.x + dx, 0), b.x + b.width - MIN_BOX);
          width = b.x + b.width - x;
        }
        if (d.handle.includes("e")) width = Math.min(Math.max(b.width + dx, MIN_BOX), W - b.x);
        if (d.handle.includes("n")) {
          y = Math.min(Math.max(b.y + dy, 0), b.y + b.height - MIN_BOX);
          height = b.y + b.height - y;
        }
        if (d.handle.includes("s")) height = Math.min(Math.max(b.height + dy, MIN_BOX), H - b.y);
      }
      setDraftBox({ x, y, width, height });
    } else {
      setView((v) => ({ ...v, tx: d.tx + e.clientX - d.cx, ty: d.ty + e.clientY - d.cy }));
    }
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setMag(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (readOnly || mode !== "landmarks" || selected == null) return;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dd = delta[e.key];
    if (!dd) return;
    e.preventDefault();
    const p = landmarks[selected] as Point;
    movePoint(selected, { x: p.x + dd[0], y: p.y + dd[1] });
  };

  const startBoxEdit = () => {
    boxBefore.current = box;
    setDraftBox(box);
    setSelected(null);
    setMode("box");
  };
  const commitBox = async () => {
    setConfirmOpen(false);
    await onBoxRedetect?.(draftBox);
    setMode("landmarks");
  };
  const onDone = () => {
    if (moved.some(Boolean)) setConfirmOpen(true);
    else void commitBox();
  };
  const cancelBox = () => {
    setConfirmOpen(false);
    setDraftBox(boxBefore.current);
    setMode("landmarks");
  };

  const k = 1 / view.s;
  const shownBox = mode === "box" ? draftBox : box;
  const label = hovered ?? selected;
  const hitR = (coarse ? 22 : 9) * k;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={fit} aria-label="Fit image">
          <Maximize /> Fit
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          aria-label="Zoom out"
          onClick={() => {
            const r = containerRef.current?.getBoundingClientRect();
            zoomAt(1 / 1.25, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2);
          }}
        >
          <Minus />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          aria-label="Zoom in"
          onClick={() => {
            const r = containerRef.current?.getBoundingClientRect();
            zoomAt(1.25, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2);
          }}
        >
          <Plus />
        </Button>
        {!readOnly && mode === "landmarks" && (
          <>
            <Button size="sm" variant="secondary" onClick={startBoxEdit} disabled={busy}>
              Edit box
            </Button>
            <Button size="sm" variant="ghost" onClick={onResetLandmarks} disabled={busy || !moved.some(Boolean)}>
              Reset landmarks
            </Button>
          </>
        )}
        {!readOnly && mode === "box" && (
          <>
            <Button size="sm" onClick={onDone} disabled={busy}>
              {busy ? "Detecting…" : "Done"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelBox} disabled={busy}>
              Cancel
            </Button>
          </>
        )}
        {mode === "landmarks" && (
          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showDetected} onCheckedChange={setShowDetected} aria-label="Show detected" />
            Show detected
          </label>
        )}
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label={mode === "box" ? "Head box editor" : "Landmark editor"}
        className="relative h-[60vh] min-h-[260px] w-full touch-none select-none overflow-hidden overscroll-contain rounded-lg bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-[72vh]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: W, height: H, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})` }}
        >
          <canvas ref={canvasRef} className="block h-full w-full" />
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${W} ${H}`}>
            <rect
              x={shownBox.x}
              y={shownBox.y}
              width={shownBox.width}
              height={shownBox.height}
              className={mode === "box" ? "fill-box/10 stroke-box" : "fill-none stroke-box"}
              strokeWidth={2 * k}
              strokeDasharray={mode === "box" ? undefined : `${6 * k} ${4 * k}`}
              data-handle={mode === "box" ? "move" : undefined}
              style={{ cursor: mode === "box" ? "move" : undefined }}
            />
            {mode === "box" &&
              HANDLES.map((h) => {
                const p = handlePos(shownBox, h);
                const size = (coarse ? 22 : 12) * k;
                return (
                  <rect
                    key={h}
                    data-handle={h}
                    x={p.x - size / 2}
                    y={p.y - size / 2}
                    width={size}
                    height={size}
                    className="fill-box stroke-canvas"
                    strokeWidth={1.5 * k}
                    style={{ cursor: `${h}-resize` }}
                  />
                );
              })}

            {mode === "landmarks" && showDetected &&
              detected.map((p, i) => (
                <circle key={`d${i}`} cx={p.x} cy={p.y} r={5 * k} className="fill-none stroke-box/60" strokeWidth={1.2 * k} pointerEvents="none" />
              ))}

            {mode === "landmarks" &&
              landmarks.map((p, i) => {
                const region = LANDMARK_REGIONS[i] ?? "nose_whiskers";
                const isSel = selected === i;
                return (
                  <g
                    key={i}
                    data-point={i}
                    style={{ cursor: readOnly ? "pointer" : "grab" }}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(i)}
                    onPointerLeave={() => setHovered((h) => (h === i ? null : h))}
                  >
                    <circle cx={p.x} cy={p.y} r={hitR} className="fill-transparent" />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={(isSel ? 6.5 : 4.5) * k}
                      className={`${REGION_FILL[region]} stroke-canvas`}
                      strokeWidth={(isSel ? 2.5 : 1.2) * k}
                    />
                    {moved[i] && <circle cx={p.x} cy={p.y} r={1.5 * k} className="fill-canvas" pointerEvents="none" />}
                  </g>
                );
              })}

            {mode === "landmarks" && label != null && landmarks[label] && (
              <text
                x={(landmarks[label] as Point).x + 9 * k}
                y={(landmarks[label] as Point).y - 9 * k}
                fontSize={13 * k}
                className="fill-canvas-foreground stroke-canvas font-mono"
                strokeWidth={3 * k}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {label}
              </text>
            )}
          </svg>
        </div>

        {mag && landmarks[mag.i] && (
          <Magnifier
            bitmap={bitmap}
            point={landmarks[mag.i] as Point}
            scale={view.s}
            container={containerRef.current}
            clientX={mag.cx}
            clientY={mag.cy}
          />
        )}

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas/50 text-sm text-canvas-foreground">
            Detecting landmarks…
          </div>
        )}
      </div>

      <AlertDialog open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace landmark edits?</AlertDialogTitle>
            <AlertDialogDescription>
              Re-detecting will replace your landmark edits. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelBox}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void commitBox()}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const MAG_SIZE = 120;
const MAG_ZOOM = 2.5;

function Magnifier({
  bitmap,
  point,
  scale,
  container,
  clientX,
  clientY,
}: {
  bitmap: ImageBitmap;
  point: Point;
  scale: number;
  container: HTMLDivElement | null;
  clientX: number;
  clientY: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = MAG_SIZE * dpr;
    c.height = MAG_SIZE * dpr;
    const r = MAG_SIZE / 2 / (scale * MAG_ZOOM);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(bitmap, point.x - r, point.y - r, 2 * r, 2 * r, 0, 0, c.width, c.height);
    const mid = c.width / 2;
    const style = getComputedStyle(c);
    ctx.strokeStyle = style.color;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(mid - 14 * dpr, mid);
    ctx.lineTo(mid + 14 * dpr, mid);
    ctx.moveTo(mid, mid - 14 * dpr);
    ctx.lineTo(mid, mid + 14 * dpr);
    ctx.stroke();
  }, [bitmap, point, scale]);

  const rect = container?.getBoundingClientRect();
  const left = clientX - (rect?.left ?? 0) - MAG_SIZE / 2;
  const top = Math.max(4, clientY - (rect?.top ?? 0) - MAG_SIZE - 50);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute rounded-full border-2 border-box bg-canvas text-box shadow-lg"
      style={{ left, top, width: MAG_SIZE, height: MAG_SIZE }}
    />
  );
}
