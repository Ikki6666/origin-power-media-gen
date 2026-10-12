/**
 * 异步任务引擎：轮询 / 取消（4 条路径封装）/ 产物下载（自动重试）
 *
 * 平台约定（实测，与文档差异以实测为准）：
 * - 创建任务返回 202 + data.id（image_/video_/music_ 前缀）
 * - 状态枚举：图片/视频 queued/running/succeeded/failed/cancelled；
 *   音乐 queued/processing/completed/failed（completed 归一化为 succeeded）
 * - 结果 URL：实测统一 task.content.results[].url；文档中的 data.images[] / video_url 兼容
 * - 预签名链接：图片 24h、视频/音乐 1h 有效，须及时下载落盘
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { maasRequest, MaasError } from "./api.js";
import { sleep } from "./util.js";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

export function taskQueryPath(kind, taskId) {
	switch (kind) {
		case "image-gen": return `/api/v3/images/tasks/${taskId}`;
		case "image-edit": return `/api/v3/images/edits/tasks/${taskId}`;
		case "video": return `/api/v3/videos/${taskId}`;
		case "music": return `/api/v3/musics/${taskId}`;
	}
}

export function extractStatus(body) {
	return body?.status ?? body?.data?.status ?? body?.task?.status;
}

export function normalizeStatus(raw) {
	if (raw === "completed") return "succeeded";
	if (raw === "processing") return "running";
	return raw;
}

export function extractResults(kind, body) {
	if (kind === "video") {
		const urls = (body?.task?.content?.results || []).map((r) => r?.url).filter(Boolean);
		if (!urls.length) {
			const fallback = body?.data?.video_url || body?.video_url;
			if (fallback) urls.push(fallback);
		}
		return { urls, audioUrl: undefined, error: body?.task?.error ?? body?.data?.error };
	}
	if (kind === "music") {
		let urls = (body?.task?.content?.results || []).map((r) => r?.url).filter(Boolean);
		const legacy = body?.video_url || body?.data?.video_url;
		if (!urls.length && legacy) urls.push(legacy);
		return { urls, audioUrl: urls[0], error: body?.task?.error ?? body?.data?.error };
	}
	// image-gen / image-edit：文档写 data.images[]，实测网关返回 task.content.results[].url，兼容两种
	const images = body?.data?.images || [];
	let urls = images.map((im) => im?.url).filter(Boolean);
	if (!urls.length) {
		urls = (body?.task?.content?.results || []).map((r) => r?.url).filter(Boolean);
	}
	return { urls, audioUrl: undefined, error: body?.data?.error ?? body?.task?.error };
}

/**
 * 轮询任务直至终态。轮询间隔 5-10 秒，不并发轰炸；拿到终态即停。
 */
export async function pollTask(kind, taskId, { intervalMs = 6_000, timeoutMs = 15 * 60_000, onUpdate } = {}) {
	const start = Date.now();
	for (;;) {
		const res = await maasRequest(taskQueryPath(kind, taskId), { timeoutMs: 30_000 });
		const status = normalizeStatus(extractStatus(res.body) || "unknown");
		onUpdate?.(status, Date.now() - start);
		if (TERMINAL.has(status)) {
			return { taskId, kind, status, body: res.body, info: extractResults(kind, res.body), elapsedMs: Date.now() - start };
		}
		if (Date.now() - start > timeoutMs) {
			throw new MaasError(`任务 ${taskId} 轮询超时（已等待 ${Math.round(timeoutMs / 1000)}s），当前状态 ${status}。任务仍在平台侧进行，可稍后查询。`, 504, undefined);
		}
		await sleep(intervalMs);
	}
}

const MIME_EXT = {
	"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
	"audio/wav": "wav", "audio/x-wav": "wav", "video/mp4": "mp4",
};

/**
 * 下载产物到本地并返回路径（自动重试 3 次，应对存储域瞬断）。
 */
export async function downloadFile(url, destPath) {
	let res;
	let lastErr;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			if (attempt > 0) await sleep(5_000 * attempt);
			res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
			lastErr = undefined;
			break;
		} catch (e) {
			lastErr = e;
		}
	}
	if (lastErr) {
		throw new MaasError(`产物下载失败（已重试 3 次）: ${lastErr.message}。预签名链接可能已过期或存储服务暂不可达，请重新查询任务获取新链接。`, 502, undefined);
	}
	if (!res.ok) {
		throw new MaasError(`产物下载失败 [${res.status}]。403 通常表示链接过期，请重新查询任务获取新链接。`, res.status, undefined);
	}
	const buf = Buffer.from(await res.arrayBuffer());
	await mkdir(dirname(destPath), { recursive: true });
	await writeFile(destPath, buf);
	return { path: destPath, bytes: buf.length };
}

/**
 * 取消任务（四条路径不统一，全部封装在此）：
 * - 文生图: DELETE /api/v3/images/tasks/{id}
 * - 图片编辑: DELETE /api/v3/images/edits/tasks/{id}
 * - 视频: DELETE /api/v3/videos/{id}（queued 200 可取消不计费；running 409 不可取消）
 * - 音乐/图片编辑共用: POST /api/v3/tasks/cancel {task_id}（202 受理，稍后查询为 failed 并退费）
 */
export async function cancelTask(kind, taskId) {
	try {
		if (kind === "image-gen") {
			await maasRequest(`/api/v3/images/tasks/${taskId}`, { method: "DELETE" });
			return "取消成功，任务进入 cancelled 终态（记录保留，仍可查询）";
		}
		if (kind === "video") {
			await maasRequest(`/api/v3/videos/${taskId}`, { method: "DELETE" });
			return "取消成功。queued 状态被取消的任务不计费（预扣自动退回），后续查询将返回 failed 终态";
		}
		await maasRequest("/api/v3/tasks/cancel", { method: "POST", body: { task_id: taskId } });
		return "取消请求已受理（HTTP 202）。约 5-10 秒后查询任务即为 failed（cancelled by user via API），计费自动解冻退费";
	} catch (e) {
		if (e instanceof MaasError) {
			if (e.status === 400) throw new MaasError("任务已到终态，不可取消", 400, e.body);
			if (e.status === 403) throw new MaasError("只能取消自己 API Key 提交的任务", 403, e.body);
			if (e.status === 404) throw new MaasError("任务不存在", 404, e.body);
			if (e.status === 409) throw new MaasError("任务不可取消：生成中的任务会正常完成并计费，或任务已到终态", 409, e.body);
		}
		throw e;
	}
}

/** 从 task_id 前缀推断任务类型（image_ 前缀文生图/编辑共用，调用方可用 kind 覆盖） */
export function guessKind(taskId) {
	if (taskId.startsWith("video_")) return "video";
	if (taskId.startsWith("music_")) return "music";
	if (taskId.startsWith("image_")) return "image-gen";
	return undefined;
}
