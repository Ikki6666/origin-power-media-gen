# Codex 平台差异

CLI 随插件分发，位于：

    <插件根>/scripts/media-gen.mjs

本 skill 文件位于：

    <插件根>/skills/origin-power-media-gen/SKILL.md

因此也可以从 skill 文件位置推导 CLI 路径：

    node <插件根>/scripts/media-gen.mjs <子命令> [参数]

无需安装依赖。产物默认落盘到 `~/.media-gen/`，也可用 `MEDIA_GEN_MEDIA_DIR` 覆盖。
