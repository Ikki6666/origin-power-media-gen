# Codex 媒体生成插件（origin-power-media-gen）

给 [OpenAI Codex CLI](https://github.com/openai/codex) 提供多模态生成能力：**文生图、图片编辑、视频生成、音乐生成**（Origin Power MaaS 平台）。

![preview](./docs/preview.jpg)

- 自带 MCP server（无依赖 Node 实现，stdio 传输），5 个工具全部异步任务制，插件内自动轮询、下载产物落盘
- 仓库同时是一个 Codex 插件 marketplace，可通过 `codex plugin marketplace add` 安装

## 工具清单

| 工具 | 说明 | 模型 |
|---|---|---|
| `generate_image` | 文生图（异步任务，自动轮询，图片内嵌返回） | Qwen-Image-2.1 |
| `edit_image` | 图片编辑（本地文件自动转 Base64，1-4 张输入） | Qwen-Image-2.1 |
| `generate_video` | 视频生成（支持首/尾帧参考图，4-15s，768P） | minimax-h3 |
| `generate_music` | 音乐生成（需提供歌词，模型逐字演唱，WAV） | MiniMax-Music3 |
| `task_status` | 任务状态查询 / 取消（封装 4 条取消路径） | — |

## 安装

```bash
# 从本地 marketplace 安装
codex plugin marketplace add /path/to/codex-origin-power-media-gen
codex plugin add origin-power-media-gen@origin-power

# 或从 GitHub（clone 后同样操作）
git clone https://github.com/Ikki6666/codex-origin-power-media-gen
codex plugin marketplace add ./codex-origin-power-media-gen
codex plugin add origin-power-media-gen@origin-power
```

安装后重启 Codex，用 `codex mcp list` 确认 `origin_power_media_gen` server 已注册。

## 配置（环境变量）

| 变量 | 说明 | 默认 |
|---|---|---|
| `MEDIA_GEN_API_KEY` | 鉴权 Key（回退 `YUANLI_API_KEY` → `AGW_API_KEY`） | — |
| `MEDIA_GEN_BASE_URL` | 网关地址 | `http://api.origin-power.com` |
| `MEDIA_GEN_MEDIA_DIR` | 产物根目录 | `~/.media-gen` |
| `MEDIA_GEN_MODELS` | 模型白名单覆盖（逗号分隔） | `Qwen-Image-2.1,minimax-h3,MiniMax-Music3` |

产物按类型存放于 `images/`、`videos/`、`musics/` 子目录。

## 使用示例

在 Codex 里直接说话：

```
画一只橘猫在雪地里打滚，水彩风格
把 ~/photo.jpg 的背景换成海边
生成一段 8 秒视频：海边日落，无人机环绕镜头
给这段歌词谱曲：...，风格：流行,女声,钢琴
```

## 与 pi 插件的关系

同一个 Origin Power MaaS 平台的另一套 agent 适配。Pi 侧插件见 https://github.com/Ikki6666/pi-origin-power-media-gen （目录默认 `~/.pi/media`，可用 `MEDIA_GEN_MEDIA_DIR` 让两个 agent 共享产物目录）。

## License

MIT
