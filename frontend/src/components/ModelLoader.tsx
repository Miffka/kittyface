import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useApp } from "@/state/app";

export function ModelLoader() {
  const { models, ensureModels } = useApp();
  if (models.status === "loading") {
    return (
      <div className="rounded-lg border bg-card p-3 text-sm" role="status">
        <div className="mb-2 flex justify-between">
          <span>Loading detection models…</span>
          <span className="font-mono tabular-nums">{Math.round(models.progress * 100)}%</span>
        </div>
        <Progress value={models.progress * 100} />
        <p className="mt-2 text-xs text-muted-foreground">
          The first load downloads about 26 MB and is faster on Wi-Fi.
        </p>
      </div>
    );
  }
  if (models.status === "error") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 text-sm" role="alert">
        <span>The models could not be loaded: {models.error}</span>
        <Button size="sm" onClick={() => void ensureModels().catch(() => undefined)}>Retry</Button>
      </div>
    );
  }
  return null;
}
