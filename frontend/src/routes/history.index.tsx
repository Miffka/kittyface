import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScoreBadge } from "@/components/ResultsPanel";
import { UNIT_LABELS } from "@/lib/units";

export const Route = createFileRoute("/history/")({
  head: () => ({
    meta: [
      { title: "History — cat-face-studio" },
      { name: "description", content: "Photos saved from this browser, with their landmarks and proxy measurements." },
      { property: "og:title", content: "History — cat-face-studio" },
      { property: "og:description", content: "Photos saved from this browser in cat-face-studio." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["uploads"], queryFn: () => api.listUploads() });
  const [pending, setPending] = useState<string | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => api.deleteUpload(id),
    onSettled: () => qc.invalidateQueries({ queryKey: ["uploads"] }),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-semibold">History</h1>
      <p className="mt-1 text-sm text-muted-foreground">Uploads saved from this browser.</p>

      {list.isPending && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}
      {list.isError && <p role="alert" className="mt-6 text-sm text-destructive">{list.error.message}</p>}
      {del.isError && <p role="alert" className="mt-6 text-sm text-destructive">{del.error.message}</p>}
      {list.data?.length === 0 && (
        <div className="mt-6 rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Nothing saved yet. <Link to="/" className="text-primary underline">Upload a photo</Link>
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {list.data?.map((u) => (
          <li key={u.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{new Date(u.created_at).toLocaleString()}</p>
              <p className="font-mono text-xs text-muted-foreground">{u.id} · {u.model_version}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {u.user_measurements.map((m) => (
                  <span key={m.unit} className="flex items-center gap-1 text-xs text-muted-foreground" title={UNIT_LABELS[m.unit]}>
                    {m.unit} <ScoreBadge score={m.score} />
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/history/$id" params={{ id: u.id }}>Open</Link>
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setPending(u.id)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this upload?</AlertDialogTitle>
            <AlertDialogDescription>The photo and its landmarks are removed from the server. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) del.mutate(pending);
                setPending(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
