# Claude Code 平台差异

插件根目录就是仓库根目录。CLI 位于：

    packages/cli/src/media-gen.mjs

调用方式：

    node packages/cli/src/media-gen.mjs <子命令> [参数]

产物默认落盘到 `~/.media-gen/`，也可用 `MEDIA_GEN_MEDIA_DIR` 覆盖。

Claude Code 会自动发现 `skills/` 目录下的 skill；不需要 SessionStart hook 来注入插件根路径。
