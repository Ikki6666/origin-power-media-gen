---
name: origin-power-media-gen
description: Generate or edit images, create videos (4-15s), and compose music (WAV) via the Origin Power MaaS platform. Use when the user asks to 画图/生图/生成图片/改图/编辑图片/生成视频/做视频/生成音乐/谱曲. All tools are async — the server polls and downloads artifacts automatically, returning local file paths (images also inline). Do NOT shell out to curl for this; always use the provided tools.
---

# 媒体生成技能（Origin Power MaaS）

## 工具选择

| 需求 | 工具 |
|---|---|
| 从文字生成图片 | `generate_image` |
| 修改已有图片 | `edit_image`（把图片本地路径直接传入 `images` 参数） |
| 生成视频（纯文字或图生视频） | `generate_video` |
| 歌词谱曲 / 生成音乐 | `generate_music` |
| 查询/取消任务 | `task_status`（仅用于会话中断后恢复或取消排队任务） |

## 关键约束

- **音乐必须提供歌词**：`generate_music` 的 `input` 是歌词本身（模型逐字演唱，不代写）。用户没给歌词时，先自己写好歌词再传入。`instructions`（风格描述）必填且非空。
- **视频并发 ≤ 2**：同平台在途视频任务超过 2 个会被限流。不要并发提交多个视频任务；server 收到 429 会自动退避重试。
- **视频时长 4-15 秒**、分辨率仅 768P；`ratio: adaptive` 仅图生视频可用（纯文生视频传 adaptive 会 422）。
- **改图用 `edit_image`**，不要用 `generate_image` 重新生成；本地图片路径直接传入 `images`。

## 耗时预期与轮询

- 图片 10-60 秒，音乐 20-60 秒，视频 1-5 分钟。
- 所有工具内部自动轮询直至终态并下载产物落盘，**不要手动轮询**，直接等工具返回。
- 结果是本地文件路径（图片还会内嵌返回）；产物在 `~/.media-gen/`（或 `MEDIA_GEN_MEDIA_DIR` 指定目录）下，可在后续操作中直接引用这些路径。

## 结果处理

- 图片结果以内嵌图片返回，可以直接基于生成图继续对话或用 `edit_image` 迭代。
- 音乐产物字段在平台侧叫 `video_url` 但值是 WAV 音频；插件已重命名为 `audio_url` 语义并落盘为 `.wav`。
- 任务失败（failed）不计费；取消排队中（queued）的任务不计费，生成中（running）不可取消。

## 错误处理

工具返回 `isError: true` 时，错误信息已含原因与建议（余额不足 402、内容审核 403、限流 429、任务不存在 404 等），直接向用户转述即可，不要盲目重试。
