---
name: origin-power-media-gen
description: Generate or edit images, create videos (4-15s), and compose music (WAV) via the Origin Power MaaS platform using the bundled media-gen CLI. Use when the user asks to 画图/生图/生成图片/改图/编辑图片/生成视频/做视频/生成音乐/谱曲/配乐. The CLI submits the async task, polls until terminal state, and downloads artifacts automatically, printing local file paths. Do NOT shell out to curl against the platform API, and do NOT hand-roll polling loops.
---

# 媒体生成技能（Origin Power MaaS）

## 触发判断

用户提出以下请求时使用本技能：

- 从文字生成图片
- 修改已有图片
- 生成视频
- 生成音乐
- 查询、等待或取消媒体任务
- 查看可用模型

## 子命令选择

| 需求 | 命令 |
|---|---|
| 从文字生成图片 | `image "<提示词>"` |
| 修改已有图片 | `edit "<编辑指令>" --images <路径或URL，逗号分隔，1-4张>` |
| 生成视频 | `video "<提示词>"` 提交；`status <task_id> --wait` 等待并下载 |
| 歌词谱曲 / 生成音乐 | `music "<歌词>" --style "<风格描述>"` |
| 查询/等待/取消任务 | `status <task_id>` |
| 查看可用模型 | `models` |

## 关键约束

- **音乐必须提供歌词**：`music` 的第一个参数是歌词本身，模型逐字演唱，不代写。用户没给歌词时，先写好歌词再调用。`--style` 必填且非空。
- **视频并发 <= 2**：不要并发提交多个视频任务；被限流时 CLI 会自动退避重试。
- **视频时长 4-15 秒**，分辨率仅 768P；`--ratio adaptive` 仅图生视频可用。
- **改图用 `edit`**，不要用 `image` 重新生成。
- **视频默认只提交不等待**：避免 Bash 超时；拿到 task_id 后用 `status <task_id> --wait` 轮询到终态并自动下载。

## 耗时预期

- 图片：10-60 秒
- 音乐：20-60 秒
- 视频：1-5 分钟

## 结果处理

产物会落盘为本地文件，命令输出 `saved: <绝对路径>`。

- 图片生成后用 Read 工具读取该路径并展示给用户。
- 继续迭代时，把该路径传给 `edit` 的 `--images`。
- 音乐产物字段在平台侧叫 `video_url`，但值是 WAV 音频；插件已重命名为 `audio_url` 并落盘为 `.wav`。
- 任务失败不计费；取消排队中的任务不计费；生成中的任务不可取消。

## 错误处理

命令以退出码 1 失败时，stderr 已含原因与建议（402 余额不足、403 内容审核、429 限流、404 任务不存在等），直接向用户转述即可，不要盲目重试。

不要用 curl 直接调用平台 API，不要手写轮询循环；`status --wait` 已封装。

## 平台差异

本技能只描述通用行为。不同 agent 的 CLI 位置、调用方式、插件根路径来源和工具形态，请参考当前平台的 reference：

- Codex：`references/codex.md`
- Claude Code：`references/claude-code.md`
- Zcode：`references/zcode.md`
- MCP：`references/mcp.md`
