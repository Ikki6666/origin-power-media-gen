# MCP 平台差异

对于仅支持 MCP 的 agent，不要引导用户直接调用 CLI。使用已发布的 MCP server：

    origin-power-media-gen-mcp

可用工具：

- `generate_image`
- `edit_image`
- `generate_video`
- `generate_music`
- `task_status`

安装示例：

```bash
claude mcp add origin-power-media-gen -- npx -y origin-power-media-gen-mcp
codex mcp add origin-power-media-gen -- npx -y origin-power-media-gen-mcp
```

环境变量与输出约定与 CLI 一致；图片产物仍以本地路径返回。
