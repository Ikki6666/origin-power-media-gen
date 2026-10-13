# Zcode 平台差异

插件根目录以 SessionStart hook 注入的信息为准：

    插件根目录: <插件根>

CLI 位于：

    <插件根>/scripts/media-gen.mjs

调用方式：

    node <插件根>/scripts/media-gen.mjs <子命令> [参数]

如果拿不到 SessionStart 注入的插件根目录，可以从本 skill 文件位置推导：本文件位于 `<插件根>/skills/origin-power-media-gen/SKILL.md`，因此 CLI 在 `<插件根>/scripts/media-gen.mjs`。

产物默认落盘到 `~/.media-gen/`，也可用 `MEDIA_GEN_MEDIA_DIR` 覆盖。
