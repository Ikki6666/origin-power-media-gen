/**
 * 配置加载（环境变量，新名 MEDIA_GEN_* 优先，兼容旧名 YUANLI_* / AGW_API_KEY）
 */

import { homedir } from "node:os";
import { join } from "node:path";

export function expandTilde(p) {
	if (p === "~") return homedir();
	if (p.startsWith("~/")) return join(homedir(), p.slice(2));
	return p;
}

const env = process.env;

/** 配置快照（读取一次环境变量；进程内复用） */
export const config = {
	get baseUrl() {
		return (env.MEDIA_GEN_BASE_URL || env.YUANLI_BASE_URL || "http://api.origin-power.com").replace(/\/+$/, "");
	},
	get apiKey() {
		return env.MEDIA_GEN_API_KEY || env.YUANLI_API_KEY || env.AGW_API_KEY;
	},
	get mediaDir() {
		return expandTilde(env.MEDIA_GEN_MEDIA_DIR || env.YUANLI_MEDIA_DIR || join(homedir(), ".media-gen"));
	},
	get supportedModels() {
		const custom = (env.MEDIA_GEN_MODELS || env.YUANLI_MODELS || "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		return custom.length > 0
			? custom
			: ["Qwen-Image-2.1", "minimax-h3", "MiniMax-Music3"];
	},
};

/**
 * 解析产物输出目录。
 * 优先级：调用参数 outputDir > MEDIA_GEN_MEDIA_DIR 子目录 > 默认
 */
export function resolveOutputDir(subdir, custom) {
	return custom ? expandTilde(custom) : join(config.mediaDir, subdir);
}
