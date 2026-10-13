import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useApp } from "@/state/app";
import { CONTACT_EMAIL } from "./Layout";

export function ConsentModal() {
  const { needsConsent, config, configError, retryConfig, agree } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAgree = async () => {
    setBusy(true);
    setError(null);
    try {
      await agree();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={needsConsent}>
      <AlertDialogContent
        className="max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-2xl">Before you start</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                cat-face-studio is a non-commercial research tool. It measures the geometry of a
                cat's face from a photo you choose.
              </p>
              <p>
                Photos are processed in your browser. Only when you press <strong>Save</strong> are
                the photo (with its metadata removed) and your box and landmark positions sent to
                our server and kept for research use.
              </p>
              <p>
                The numbers shown are geometric proxy measurements, not a veterinary or welfare
                judgement. To have a saved photo removed, write to {CONTACT_EMAIL}.
              </p>
              {config && <p className="text-xs">Notice version {config.notice_version}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {configError && (
          <p className="text-sm text-destructive">
            The notice could not be loaded.{" "}
            <button className="underline" onClick={retryConfig}>Retry</button>
          </p>
        )}
        <AlertDialogFooter>
          <Button onClick={onAgree} disabled={!config || busy} className="w-full sm:w-auto">
            {busy ? "Saving…" : "I agree"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
