---
description: 媒体生成（图片/视频/音乐）入口：检查配置后调用随插件的 media-gen CLI
---

用户想生成媒体。按以下步骤处理：

1. 从会话上下文找 media-gen 插件根目录（SessionStart 注入的“插件根目录: ...”），CLI 为 `<插件根>/scripts/media-gen.mjs`；找不到时从本命令文件位置推导（本文件位于 `<插件根>/commands/`）。
2. 若上下文显示 API Key 未配置，先指引设置环境变量 MEDIA_GEN_API_KEY 后再继续。
3. 按需求选择子命令（node 直接运行）：
   - 文生图：`image "<提示词>"`（可加 `--size 1024x1024`、`--n` 张数）
   - 图片编辑：`edit "<编辑指令>" --images <路径1,路径2>`
   - 视频：`video "<提示词>"` 提交，然后 `status <task_id> --wait` 等待并下载
   - 音乐：`music "<歌词>" --style "<风格>"`（用户没给歌词就先写好歌词）
4. 图片生成后用 Read 读取产物路径展示；音乐/视频报告本地文件路径。

约束：音乐歌词必填；视频并发 ≤ 2；改图用 edit 不用 image。

$ARGUMENTS
