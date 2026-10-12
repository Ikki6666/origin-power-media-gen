#!/usr/bin/env node
/**
 * SessionStart hook：注入插件根路径与配置状态（media-gen）。
 *
 * 协议（ZCode）：stdin 读一个 JSON 事件对象；stdout 输出一个 JSON 对象（必须以 { 开头）；
 * 诊断只走 stderr（不打印密钥值）。
 *
 * 手动冒烟：
 *   printf '%s\n' '{"hook_event_name":"SessionStart","session_id":"manual","source":"startup"}' \
 *     | node hooks/session-start.mjs
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let input = {};
try {
	input = raw.trim() ? JSON.parse(raw) : {};
} catch (err) {
	process.stderr.write(`[media-gen] invalid SessionStart stdin: ${err}\n`);
	process.exit(1);
}

const eventName = input.hook_event_name || input.hookEventName || "SessionStart";
// 插件根路径：优先环境变量；兜底从本脚本位置推导（loader 会把 ${ZCODE_PLUGIN_ROOT} 展开进 args，
// 但不保证 hook 进程也能拿到该环境变量）
const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.ZCODE_PLUGIN_ROOT || resolve(scriptDir, "..");
const hasKey = Boolean(
	process.env.MEDIA_GEN_API_KEY || process.env.YUANLI_API_KEY || process.env.AGW_API_KEY,
);
const mediaDir = process.env.MEDIA_GEN_MEDIA_DIR || process.env.YUANLI_MEDIA_DIR || "~/.media-gen";

process.stdout.write(
	JSON.stringify({
		hookSpecificOutput: {
			hookEventName: eventName,
			additionalContext: [
				"media-gen 插件已启用（Origin Power MaaS：文生图/图片编辑/视频/音乐）。",
				`插件根目录: ${pluginRoot}`,
				`CLI: node ${join(pluginRoot, "scripts", "media-gen.mjs")} <image|edit|music|video|status|models>`,
				`API Key: ${hasKey ? "已配置" : "未配置（生成前需设置环境变量 MEDIA_GEN_API_KEY）"}`,
				`产物目录: ${mediaDir}（下分 images/ videos/ musics/）`,
			].join("\n"),
		},
	}),
);
