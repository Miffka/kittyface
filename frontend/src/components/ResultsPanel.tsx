import { Link } from "@tanstack/react-router";
import type { Measurement } from "@/geometry/measurements";
import { Button } from "@/components/ui/button";
import { HEAD_POSITION_LABEL, HEAD_POSITION_TEXT, UNIT_LABELS } from "@/lib/units";

export type SaveState =
  | { s: "idle" }
  | { s: "saving" }
  | { s: "saved"; id: string }
  | { s: "error"; msg: string };

interface Props {
  measurements: Measurement[] | null;
  versions: { model: string; threshold: string; geometry: string };
  save?: { state: SaveState; onSave: () => void; disabled: boolean } | undefined;
}

export function ScoreBadge({ score }: { score: 0 | 1 | 2 }) {
  return (
    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-score px-2 font-mono text-sm font-semibold text-score-foreground">
      {score}
    </span>
  );
}

export function ResultsPanel({ measurements, versions, save }: Props) {
  return (
    <section aria-label="Measurements" className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-lg font-semibold">Measurements</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-2 font-medium">Action unit</th>
            <th className="py-2 pr-2 text-right font-medium">Ratio</th>
            <th className="py-2 text-right font-medium">Score</th>
          </tr>
        </thead>
        <tbody>
          {(["ear", "orbital", "muzzle", "whisker"] as const).map((unit) => {
            const m = measurements?.find((x) => x.unit === unit);
            return (
              <tr key={unit} className="border-b last:border-0">
                <td className="py-2.5 pr-2">{UNIT_LABELS[unit]}</td>
                <td className="py-2.5 pr-2 text-right font-mono tabular-nums">
                  {m ? m.ratio.toFixed(3) : "—"}
                </td>
                <td className="py-2.5 text-right">{m ? <ScoreBadge score={m.score} /> : "—"}</td>
              </tr>
            );
          })}
          <tr>
            <td className="py-2.5 pr-2">{HEAD_POSITION_LABEL}</td>
            <td className="py-2.5 pr-2 text-right font-mono">—</td>
            <td className="py-2.5 text-right text-xs text-muted-foreground">{HEAD_POSITION_TEXT}</td>
          </tr>
        </tbody>
      </table>

      {save && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 p-3 backdrop-blur lg:static lg:mt-4 lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto flex max-w-7xl flex-col gap-2">
            <Button onClick={save.onSave} disabled={save.disabled || save.state.s === "saving"} className="w-full">
              {save.state.s === "saving" ? "Saving…" : save.state.s === "saved" ? "Saved" : "Save"}
            </Button>
            {save.state.s === "saved" && (
              <p className="text-center text-sm">
                Saved.{" "}
                <Link to="/history/$id" params={{ id: save.state.id }} className="font-medium text-primary underline">
                  View in History
                </Link>
              </p>
            )}
            {save.state.s === "error" && (
              <p role="alert" className="text-center text-sm text-destructive">{save.state.msg}</p>
            )}
          </div>
        </div>
      )}

      <p className="mt-4 space-x-3 text-xs text-muted-foreground">
        <span>Model {versions.model}</span>
        <span>Thresholds {versions.threshold}</span>
        <span>Geometry {versions.geometry}</span>
      </p>
    </section>
  );
}
