# APP-14: legal and About pages

Groomed retrospectively from the [APP-14 entry](../backlog.md#app-14-legal-and-about-pages). Status: delivered (partial).

**Story.** As a user or reviewer, I want an About page that explains the proxy scores honestly, so I know what the app does and does not measure.

**Scope.**
- `frontend/src/routes/index.tsx` is the About page, served at `/`. Sections: the Feline Grimace Scale, how each proxy is measured, limitations, models and licence (CC BY-NC 4.0), and a privacy notice with a takedown contact.
- `frontend/src/components/Layout.tsx`: a footer with links to About, the privacy section and a takedown mailto, plus the persistent banner.
- `frontend/src/test/image-and-wording.test.ts`: fails if "pain", "painful", "suffering", "diagnosis" or "health" appear in any source file other than the About page and tests.

**Acceptance criteria.**
- [x] The wording test passes, so those words appear in UI text only on the About page.
- [x] The About page describes all four proxies and says head position is "Not possible to score".
- [x] The About page states the CC BY-NC 4.0 licence.
- [x] The footer shows a takedown and deletion contact on every page.
- [x] The About page reproduces no FGS image or logo.

**Depends on.** [RSCH-5](../backlog.md#rsch-5-e5-threshold-derivation-for-the-0-2-proxy-scores) for the correlation stat.

**Out of scope.** Each item is open in [APP-14 in the backlog](../backlog.md#app-14-legal-and-about-pages).
- The FGS citation link and the model attribution are `TODO` text.
- The whisker and muzzle correlation stat is missing. It waits on RSCH-5.
- A Terms page with the photo-rights condition.
- The Impressum decision in `docs/DECISIONS.md`.
- The contact address is the placeholder `TODO-contact@example.org` in `Layout.tsx` and appears in the footer and the consent dialog.
- The About text says the FGS is "validated" and describes pain assessment, which is the allowed place for that wording.
