# ANVIL (working name)

An agent-run game studio with an onchain economy.

A prompt becomes a finished, published 3D game asset. An orchestrator agent
with its own wallet discovers and **pays per step** for specialised services;
every asset records its contributors, and revenue from the platform is split
onchain between them.

Roblox is the flashiest export target, not the platform: the same pipeline
emits GLB for any engine or for the web viewer.

> **Note on scope:** Roblox prohibits blockchain integrations and off-platform
> monetisation, so no Roblox in-game revenue is ever touched. The onchain
> economy is entirely our own: subscriptions, generation credits, and asset
> licensing.

## Pipeline

```
prompt -> Modeller (headless Blender) -> FBX + GLB + preview
       -> Publisher (Roblox Open Cloud) -> assetId
       -> Scripter (Luau + place publish)
```

Each stage is an x402-gated service. The orchestrator pays; no API keys are
shared between agents.

## Status

- [x] Modeller: spec JSON -> FBX/GLB/PNG, headless, ~7s per prop
- [ ] Publisher: written, untested (needs a Roblox Open Cloud API key)
- [ ] Scripter
- [ ] x402 gating
- [ ] AssetRegistry + SplitVault
- [ ] Agent identity

## Running the modeller

```bash
blender --background --python forge/gen_asset.py -- forge/specs/stall.json out
```

Requires Blender 5.x. Outputs land in `out/` with a `.report.json` beside them.
