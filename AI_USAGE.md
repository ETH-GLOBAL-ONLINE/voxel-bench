# AI usage

ETHOnline 2026 requires disclosing which parts of the project were built with
AI assistance. This file is the running log.

| Area | Tool | What the AI did | What we did |
|---|---|---|---|
| `forge/gen_asset.py` | Claude Code (Opus 5) | First draft of the headless Blender generator: spec parsing, primitive builder, bounding-sphere camera framing, exporters | Chose the parametric-primitive approach over text-to-mesh, tuned exposure and the AgX -> Standard view transform decision, validated output in Blender 5.2 |
| `services/roblox_upload.py` | Claude Code (Opus 5) | Open Cloud Assets multipart upload + operation polling, stdlib only | Verified endpoint/format/limits against Roblox Open Cloud docs |

No spec-driven / prompt-file workflow is in use. Prompts were conversational;
the substantive design decisions are recorded in `docs/` as they are made.
