import { useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALLOWED_TYPES } from "@/lib/image";

const ACCEPT = ALLOWED_TYPES.join(",");

export function UploadZone({ onFile }: { onFile: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onFile(f);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      className={`flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-8 text-center transition-colors lg:h-[72vh] ${
        over ? "border-primary bg-accent/40" : "border-border bg-card"
      }`}
    >
      <ImageUp className="h-10 w-10 text-muted-foreground" aria-hidden />
      <div>
        <h2 className="text-2xl font-semibold">Upload a cat photo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="hidden lg:inline">Drag a photo here, or choose a file. </span>
          One photo, face clearly visible. JPEG, PNG or WebP, up to 5 MB.
        </p>
      </div>
      <Button onClick={() => fileRef.current?.click()}>
        <ImageUp /> Choose file
      </Button>
      <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={pick} data-testid="file-input" />
    </div>
  );
}
