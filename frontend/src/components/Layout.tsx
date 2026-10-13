import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export const CONTACT_EMAIL = "TODO-contact@example.org";
export const BANNER_TEXT =
  "Research tool. These are geometric proxy measurements, not a medical or welfare assessment.";

const navLinkClass =
  "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

export function Header() {
  const [open, setOpen] = useState(false);
  const links = (
    <>
      <Link to="/upload" className={navLinkClass} activeProps={{ className: "text-foreground" }} onClick={() => setOpen(false)}>
        Upload a photo
      </Link>
      <Link to="/history" className={navLinkClass} activeProps={{ className: "text-foreground" }} onClick={() => setOpen(false)}>
        History
      </Link>
      <Link to="/" className={navLinkClass} activeProps={{ className: "text-foreground" }} onClick={() => setOpen(false)}>
        About
      </Link>
    </>
  );
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-baseline gap-2" onClick={() => setOpen(false)}>
          <span className="font-display text-xl font-semibold tracking-tight">cat-face-studio</span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">{links}</nav>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X /> : <Menu />}
        </Button>
      </div>
      {open && <nav className="flex flex-col gap-1 border-t px-4 py-2 lg:hidden">{links}</nav>}
    </header>
  );
}

export function Banner() {
  return (
    <div role="note" className="bg-banner px-4 py-1.5 text-center text-xs text-banner-foreground sm:text-sm">
      {BANNER_TEXT}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-12 border-t bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>cat-face-studio · non-commercial research tool</span>
        <div className="flex flex-wrap gap-4">
          <Link to="/" className="hover:text-foreground">About</Link>
          <Link to="/" hash="privacy" className="hover:text-foreground">Privacy notice</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground">
            Takedown &amp; deletion: {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}
