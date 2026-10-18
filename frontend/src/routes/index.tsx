import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { CONTACT_EMAIL } from "@/components/Layout";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "cat-face-studio — geometric proxy measurements of cat faces" },
      { name: "description", content: "What the cat-face-studio proxy measurements mean, their limitations, and credits." },
      { property: "og:title", content: "cat-face-studio" },
      { property: "og:description", content: "How the four geometric proxies are measured, their limitations, and model attribution." },
    ],
  }),
  component: About,
});

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function About() {
  return (
    <article className="mx-auto max-w-3xl space-y-10 px-4 py-10 leading-relaxed">
      <header className="space-y-4">
        <h1 className="text-4xl font-semibold">About</h1>
        <p className="text-muted-foreground">
          cat-face-studio measures the geometry of a cat's face from one photo. It is a research tool,
          not a diagnosis.
        </p>
        <Link
          to="/upload"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Upload a photo
        </Link>
      </header>

      <Section title="The Feline Grimace Scale">
        <p>
          The Feline Grimace Scale is a validated instrument that trained observers use to assess
          acute pain in cats from five facial action units: ear position, orbital tightening, muzzle
          tension, whisker change and head position. Each unit is scored 0, 1 or 2.{" "}
          Source: Evangelista MC et al. (2019),{" "}
          <a href="https://doi.org/10.1038/s41598-019-55693-8" className="text-primary underline">
            Facial expressions of pain in cats: the development and validation of a Feline Grimace Scale
          </a>
          , Scientific Reports 9:19128. See also{" "}
          <a href="https://www.felinegrimacescale.com" className="text-primary underline">felinegrimacescale.com</a>.
        </p>
        <p>
          This app does not apply the scale. It computes geometric proxies inspired by it. They say
          nothing about a cat's health or suffering and must not be used in place of a veterinarian.
        </p>
      </Section>

      <Section title="How each proxy is measured">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Ear position (proxy):</strong> the distance from each ear tip to the centre of the eye below it, divided by the distance between the eyes.</li>
          <li><strong>Orbital tightening (proxy):</strong> the height of each eye opening divided by its width, averaged over both eyes.</li>
          <li><strong>Muzzle tension (proxy):</strong> the width of the mouth line divided by the distance between the eyes.</li>
          <li><strong>Whisker change (proxy):</strong> the distance between the centres of the two whisker pads, divided by the distance between the eyes. It measures the pads, not the whiskers themselves.</li>
          <li><strong>Head position:</strong> cannot be measured from a face photo, because it depends on the head relative to the shoulders. It is always shown as "Not possible to score".</li>
        </ul>
        <p className="text-sm text-muted-foreground">Each ratio is turned into a 0–2 proxy score with versioned cut-offs. No total is ever shown.</p>
      </Section>

      <Section title="Limitations">
        <ul className="list-disc space-y-2 pl-5">
          <li>The muzzle and whisker proxies use overlapping face regions, so they are not independent.</li>
          <li>Ratios depend on head angle, camera distance, lens and photo quality.</li>
          <li>The landmark model can be wrong; check and correct points before saving.</li>
          <li>Cut-offs are provisional research values and are not clinically validated.</li>
        </ul>
      </Section>

      <Section title="Models and licence">
        <p>
          The cat face localizer and landmark models are by Hugo Cornellier (
          <a href="https://huggingface.co/hugocornellier/cat-face-landmarks" className="text-primary underline">
            huggingface.co/hugocornellier/cat-face-landmarks
          </a>
          ), converted to ONNX for use in the browser.
        </p>
        <p>The models are used under the Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0) licence.</p>
      </Section>

      <Section id="privacy" title="Privacy notice">
        <p>
          Photos are processed in your browser. Nothing is sent until you press Save. Then the photo,
          with all metadata removed, and your box and landmark positions are stored for research use,
          linked only to a random token kept in this browser.
        </p>
        <p>
          This project is non-commercial. For takedown or deletion requests, contact{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </article>
  );
}
