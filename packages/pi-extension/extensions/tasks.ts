/**
 * 薄适配层：core 异步任务引擎的 cfg-first 签名兼容包装。
 * 业务逻辑全部来自 origin-power-media-gen-core。
 */

export type { TaskKind } from "origin-power-media-gen-core";
export {
	extractStatus,
	normalizeStatus,
	guessKind,
	taskQueryPath,
	extractResults,
	sleep,
} from "origin-power-media-gen-core";
import {
	pollTask as corePollTask,
	downloadFile as coreDownloadFile,
	cancelTask as coreCancelTask,
	type TaskKind,
} from "origin-power-media-gen-core";
import type { MaasConfig } from "origin-power-media-gen-core";

export interface PollOptions {
	signal?: AbortSignal;
	onUpdate?: (status: string, elapsedMs: number) => void;
	intervalMs?: number;
	timeoutMs?: number;
}

export interface PollResult {
	taskId: string;
	kind: TaskKind;
	status: string;
	body: any;
	info: { urls: string[]; audioUrl?: string; error?: { code?: string; message?: string } };
	elapsedMs: number;
}

/** 兼容旧签名：cfg 参数仅为保持工具代码不变 */
export function pollTask(
	_cfg: MaasConfig,
	kind: TaskKind,
	taskId: string,
	opts: PollOptions = {},
): Promise<PollResult> {
	return corePollTask(kind, taskId, opts);
}

export function downloadFile(url: string, destPath: string, signal?: AbortSignal) {
	return coreDownloadFile(url, destPath, signal);
}

export function cancelTask(_cfg: MaasConfig, kind: TaskKind, taskId: string): Promise<string> {
	return coreCancelTask(kind, taskId);
}
