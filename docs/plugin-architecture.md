# Plugin architecture

This repo separates capability logic from platform distribution. The source of truth is a shared core, one CLI, and one skill. Codex/Zcode/MCP are thin adapters.

## Source of truth

| Layer | Location | Responsibility |
|---|---|---|
| Core client | `packages/core` | Auth, model resolution, task polling, artifact download, error mapping |
| CLI | `packages/cli` | Stable `image / edit / video / music / status / models` command surface |
| Skill | `skills/origin-power-media-gen` | Media intent routing, constraints, polling, result handling |
| Platform refs | `skills/origin-power-media-gen/references` | Codex/Zcode/MCP-specific invocation |
| Adapters | `adapters/*` | Manifests, static assets, hooks, commands, metadata |

`scripts/build-plugins.mjs` produces zero-install plugin trees under `dist/plugins/<target>`. It vendors `packages/core` into each artifact and rewrites the CLI import from the workspace package name to the local vendored path.

## Stable contracts

### CLI

Subcommands must remain:

```text
image  <prompt>
edit   <prompt> --images <path-or-url,...>
video  <prompt>
music  <lyrics> --style <style>
status <task-id>
models
```

Default output includes `saved: <absolute-path>` for generated artifacts. JSON output is available with `--json`.

### MCP

The compatibility MCP server remains:

```text
generate_image
edit_image
generate_video
generate_music
task_status
```

MCP is the fallback for agents that do not support bundled skills. It is not the primary plugin form.

### Environment

Environment variables remain compatible:

```text
MEDIA_GEN_API_KEY
MEDIA_GEN_BASE_URL
MEDIA_GEN_MEDIA_DIR
MEDIA_GEN_MODELS
YUANLI_API_KEY
AGW_API_KEY
```

### Error behavior

Business errors use exit code 1 and write the reason/suggestion to stderr. Usage errors use exit code 2. The skill should report errors to the user without blind retries.

## Adapter policy

Adapters may contain only platform manifests, hooks, commands, README files, and static metadata. They must not contain another copy of:

- `packages/core`
- `packages/cli/src/media-gen.mjs`
- `skills/origin-power-media-gen/SKILL.md`

`scripts/check-plugins.mjs` enforces this and validates the generated artifacts.

## Tests and acceptance

Run:

```bash
npm test
```

This runs core tests, CLI smoke tests, plugin generation, and plugin structure checks.
