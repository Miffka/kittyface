import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { uprightBitmap } from "@/lib/image";
import { Editor } from "@/components/Editor";
import { ResultsPanel } from "@/components/ResultsPanel";

export const Route = createFileRoute("/history/$id")({
  head: () => ({
    meta: [
      { title: "Saved upload — cat-face-studio" },
      { name: "description", content: "A saved cat photo with its head box, landmarks and proxy measurements, read-only." },
      { property: "og:title", content: "Saved upload — cat-face-studio" },
      { property: "og:description", content: "A saved upload opened read-only in cat-face-studio." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HistoryEntry,
});

function HistoryEntry() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["upload", id],
    queryFn: async () => {
      const [detail, image] = await Promise.all([api.getUpload(id), api.getUploadImage(id)]);
      const bitmap = await uprightBitmap(image, detail.metadata.orientation);
      return { detail, bitmap };
    },
    retry: false,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Saved upload</h1>
        <Link to="/history" className="text-sm text-primary underline">Back to History</Link>
      </div>
      {q.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.isError && <p role="alert" className="rounded-lg border bg-card p-6 text-center">{q.error.message}</p>}
      {q.data && (() => {
        const m = q.data.detail.metadata;
        const pts = (xy: [number, number][]) => xy.map(([x, y]) => ({ x, y }));
        return (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Editor
                readOnly
                bitmap={q.data.bitmap}
                box={m.final_box}
                landmarks={pts(m.user_landmarks)}
                detected={pts(m.model_landmarks)}
                moved={m.moved_flags}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {new Date(q.data.detail.created_at).toLocaleString()} · {m.moved_flags.filter(Boolean).length} of 48 points moved by hand
              </p>
            </div>
            <ResultsPanel
              measurements={m.user_measurements}
              versions={{ model: m.model_version, threshold: m.threshold_version, geometry: m.geometry_version }}
            />
          </div>
        );
      })()}
    </div>
  );
}
