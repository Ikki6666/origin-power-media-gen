# origin-power-media-gen (ZCode)

Media generation plugin for ZCode — text-to-image, image editing, video (4-15s), and music (WAV) via the Origin Power MaaS platform.

No MCP server: the plugin ships a bundled CLI (`scripts/media-gen.mjs`, vendored from `packages/core` in the parent monorepo). A skill teaches agents when and how to call it, and a SessionStart hook injects the plugin root path and config status into the session.

## Install

1. ZCode → Plugin Marketplace → Add → Add Plugin Marketplace, paste the directory containing `marketplace.json` (the `adapters/zcode/` folder of this repo).
2. Personal → `origin-power-media-gen-zcode` → `origin-power-media-gen` → Install.
3. Set the API key environment variable, then restart the session:

   ```bash
   export MEDIA_GEN_API_KEY=...
   ```

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `MEDIA_GEN_API_KEY` | Auth key (falls back to `YUANLI_API_KEY`, then `AGW_API_KEY`) | — |
| `MEDIA_GEN_BASE_URL` | Gateway base URL | `http://api.dev.origin-power.com` |
| `MEDIA_GEN_MEDIA_DIR` | Artifact root | `~/.media-gen` |
| `MEDIA_GEN_MODELS` | Model whitelist override (comma separated) | `Qwen-Image-2.1,minimax-h3,MiniMax-Music3` |

## CLI

`node <plugin-root>/scripts/media-gen.mjs <command>`:

| Command | Purpose |
|---|---|
| `image "<prompt>"` | Text-to-image, one shot (submit + poll + download), 10-60s |
| `edit "<instruction>" --images <p1,p2>` | Edit images (1-4, local paths auto-Base64) |
| `music "<lyrics>" --style "<desc>"` | Music; lyrics are sung verbatim, style required |
| `video "<prompt>"` | Video: submit only by default; `--wait` to wait & download (1-5 min) |
| `status <task_id> [--wait] [--cancel]` | Query / wait (auto-download on success) / cancel |
| `models` | List accessible whitelisted models |

Use `--json` for machine-readable output. Artifacts land under `images/`, `videos/`, `musics/` inside `MEDIA_GEN_MEDIA_DIR`. Exit codes: 0 success, 1 business failure (stderr carries the reason), 2 usage error.

## Maintenance

`scripts/core/` is a vendored copy of `packages/core` from the parent monorepo — keep it in sync when core changes (`diff -r packages/core/src adapters/zcode/origin-power-media-gen/scripts/core/src`).
