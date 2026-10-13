<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Every backend call goes through `src/api/client.ts`, which picks the HTTP or in-memory mock service — keeps the app runnable without a backend.
- `src/ml/` and `src/geometry/` are placeholder modules with fixed signatures; UI never resizes images or computes ratios — real code drops in later without UI changes.
- `src/ml/`, `src/geometry/`, `src/api/` contain no UI code and no `any` — they're swapped/maintained independently.
- localStorage holds only the client token and accepted notice version — privacy requirement from the spec.
