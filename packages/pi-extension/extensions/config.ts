/**
 * 薄适配层：把 core 的配置快照成 pi 扩展使用的 MaasConfig 形态。
 * 业务逻辑全部来自 origin-power-media-gen-core。
 */

import { config as coreConfig, resolveOutputDir as coreResolveOutputDir } from "origin-power-media-gen-core";

export interface MaasConfig {
	baseUrl: string;
	apiKey: string | undefined;
	mediaDir: string;
	supportedModels: string[];
	modelsFromEnv: boolean;
}

export function loadConfig(): MaasConfig {
	return {
		baseUrl: coreConfig.baseUrl,
		apiKey: coreConfig.apiKey,
		mediaDir: coreConfig.mediaDir,
		supportedModels: coreConfig.supportedModels,
		modelsFromEnv: Boolean(process.env.MEDIA_GEN_MODELS || process.env.YUANLI_MODELS),
	};
}

/** 兼容旧签名：cfg 参数仅为保持工具代码不变，实际由 core 读取环境 */
export function resolveOutputDir(_cfg: MaasConfig, subdir: string, custom?: string): string {
	return coreResolveOutputDir(subdir, custom);
}
