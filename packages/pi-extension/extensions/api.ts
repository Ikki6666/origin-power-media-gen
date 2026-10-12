/**
 * 薄适配层：core HTTP 客户端的 cfg-first 签名兼容包装。
 * 业务逻辑全部来自 origin-power-media-gen-core。
 */

export { MaasError } from "origin-power-media-gen-core";
import {
	maasRequest as coreMaasRequest,
	listModels as coreListModels,
	resolveModel as coreResolveModel,
	requireApiKey as coreRequireApiKey,
} from "origin-power-media-gen-core";
import type { MaasConfig, MaasResponse } from "origin-power-media-gen-core";

/** 兼容旧签名：cfg 参数仅为保持工具代码不变 */
export function maasRequest<T = any>(
	_cfg: MaasConfig,
	path: string,
	opts?: {
		method?: string;
		body?: unknown;
		headers?: Record<string, string>;
		timeoutMs?: number;
	},
): Promise<MaasResponse<T>> {
	return coreMaasRequest<T>(path, opts);
}

export function listModels(_cfg: MaasConfig): Promise<string[]> {
	return coreListModels();
}

export function resolveModel(_cfg: MaasConfig, model: string | undefined, matchKeywords: string[]): Promise<string> {
	return coreResolveModel(model, matchKeywords);
}

export function requireApiKey(_cfg: MaasConfig): string {
	return coreRequireApiKey();
}
