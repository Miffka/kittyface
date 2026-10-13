import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/components/Workspace";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload a photo — cat-face-studio" },
      { name: "description", content: "Upload a cat photo, adjust the head box and 48 facial landmarks, and see geometric proxy measurements." },
      { property: "og:title", content: "Upload a photo — cat-face-studio" },
      { property: "og:description", content: "Mark 48 facial landmarks on a cat photo and see geometric proxy measurements." },
    ],
  }),
  component: Workspace,
});
