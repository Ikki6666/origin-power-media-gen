/**
 * Origin Power MaaS HTTP 客户端：鉴权、统一错误映射、模型列表缓存校验
 */

import { config } from "./config.js";

export class MaasError extends Error {
	constructor(message, status, body) {
		super(message);
		this.name = "MaasError";
		this.status = status;
		this.body = body;
	}
}

const STATUS_HINTS = {
	400: "参数缺失/非法/含未知字段",
	401: "API Key 缺失或无效",
	402: "账户余额不足，任务未创建",
	403: "内容审核不通过，或无权操作该任务",
	404: "资源不存在/已过期/不属于当前 Key",
	409: "任务状态冲突（如生成中或终态不可取消）",
	413: "请求体或字段值超限",
	415: "Content-Type 不受支持",
	422: "参数取值非法",
	429: "请求过于频繁或在途任务数超限",
	500: "任务服务内部错误",
	503: "模型无可用路由或依赖服务不可用",
};

export function requireApiKey() {
	if (!config.apiKey) {
		throw new MaasError("未配置 Origin Power MaaS API Key。请设置环境变量 MEDIA_GEN_API_KEY。", 401, undefined);
	}
	return config.apiKey;
}

export async function maasRequest(path, opts = {}) {
	const token = requireApiKey();
	const res = await fetch(`${config.baseUrl}${path}`, {
		method: opts.method || "GET",
		headers: {
			Authorization: `Bearer ${token}`,
			...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
			...(opts.headers || {}),
		},
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
		signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
	});
	const text = await res.text();
	let body;
	try {
		body = text ? JSON.parse(text) : undefined;
	} catch {
		body = undefined;
	}
	if (res.status >= 400) {
		const apiMsg = body?.error?.message || body?.error || (typeof body?.message === "string" ? body.message : "");
		const hint = STATUS_HINTS[res.status] || "请求失败";
		const rid = body?.request_id ? ` (request_id: ${body.request_id})` : "";
		throw new MaasError(`MaaS 请求失败 [${res.status}] ${hint}${apiMsg ? `: ${apiMsg}` : ""}${rid}`, res.status, body ?? text.slice(0, 500));
	}
	return { status: res.status, body, text };
}

// ---------- 模型列表（缓存 5 分钟） ----------

let modelsCache;

export async function listModels() {
	if (modelsCache && Date.now() - modelsCache.at < 5 * 60_000) return modelsCache.ids;
	const res = await maasRequest("/v1/models");
	const ids = (res.body?.data || []).map((m) => m.id);
	modelsCache = { ids, at: Date.now() };
	return ids;
}

/** 校验模型 ID；model 缺省时按关键词自动挑选。仅接受白名单内模型 */
export async function resolveModel(model, matchKeywords) {
	const ids = await listModels();
	const supported = ids.filter((id) => config.supportedModels.includes(id));
	if (model) {
		if (!config.supportedModels.includes(model)) {
			throw new MaasError(`模型 "${model}" 不在本插件支持范围内。支持的模型: ${config.supportedModels.join(", ")}`, 400, undefined);
		}
		if (ids.length > 0 && !ids.includes(model)) {
			throw new MaasError(`模型 "${model}" 不在当前 Key 可访问列表中。可用模型: ${supported.join(", ")}`, 400, undefined);
		}
		return model;
	}
	const hit = supported.find((id) => matchKeywords.some((kw) => id.toLowerCase().includes(kw)));
	if (!hit) {
		throw new MaasError(`未指定 model 且无法自动匹配（关键词: ${matchKeywords.join("/")}）。支持的模型: ${config.supportedModels.join(", ")}`, 400, undefined);
	}
	return hit;
}
