# AI workflow log

## RSCH-6: tflite to ONNX export (2026-09-28)

- Orchestrator (main session) planned the run with the product owner. Decisions taken up front: tf2onnx + tensorflow-cpu in a new `train` group, OpenVINO as the tflite reference runtime, one script in `scripts/` that exports, simplifies and checks in a single call, and CatFLW images as local-only fixtures that are never committed.
- PM subagent groomed the task into [issues/RSCH-6.md](issues/RSCH-6.md). The product owner rejected the in-place backlog rewrite and the drafted follow-up issues during grooming, so the groomed issue lives in its own file and has no out-of-scope list.
- Engineer subagent implemented it in four commits. tf2onnx names nodes differently on every run, which broke the "second run leaves the manifest unchanged" criterion; the engineer fixed it by renaming internal tensors by position before hashing. The product owner rejected the first test file, and the engineer rewrote it around a real output perturbation instead of a tolerance tuned to sit just below the measured divergence.
- QA subagent passed all 12 criteria on the first round. Gaps it noted: the tests cover only the localizer, and nothing runs `main()` on real fixtures.
- Open: APP-19 still assumes committed fixtures, but CatFLW images can't be committed, so CI needs redistributable photos before APP-19 can pass.
