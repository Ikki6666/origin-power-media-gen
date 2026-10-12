#!/usr/bin/env node
/**
 * Origin Power 媒体生成 MCP Server（stdio 传输，newline-delimited JSON-RPC 2.0）
 *
 * 给 Codex / Claude Code / Cursor / Windsurf 等提供多模态生成工具（Origin Power MaaS 平台）：
 *   generate_image / edit_image / generate_video / generate_music / task_status
 *
 * 业务逻辑来自 origin-power-media-gen-core（与 pi 原生扩展共用）。
 * 安装即用：claude mcp add origin-power-media-gen -- npx -y origin-power-media-gen-mcp
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import readline from "node:readline";
import {
	MaasError,
	config,
	resolveOutputDir,
	listModels,
	resolveModel,
	pollTask,
	downloadFile,
	cancelTask,
	guessKind,
	taskQueryPath,
	extractStatus,
	normalizeStatus,
	sleep,
} from "origin-power-media-gen-core";

// ---------- 输入处理 ----------

async function readLocalImageBase64(src) {
	if (/^https?:\/\//i.test(src)) return { url: src };
	const { stat, readFile } = await import("node:fs/promises");
	const path = src.startsWith("~/") ? join(process.env.HOME || "", src.slice(2)) : src;
	const info = await stat(path).catch(() => {
		throw new MaasError(`输入图片不存在或不可读: ${path}`, 400, undefined);
	});
	if (info.size > 50 * 1024 * 1024) {
		throw new MaasError(`输入图片超过 50 MiB 限制: ${path}`, 413, undefined);
	}
	return { base64: (await readFile(path)).toString("base64") };
}

async function toFrameRef(src) {
	if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
	const { readFile } = await import("node:fs/promises");
	const path = src.startsWith("~/") ? join(process.env.HOME || "", src.slice(2)) : src;
	const buf = await readFile(path).catch(() => {
		throw new MaasError(`参考帧图片不存在或不可读: ${path}`, 400, undefined);
	});
	return `data:image/png;base64,${buf.toString("base64")}`;
}

// ---------- 工具实现 ----------

function textContent(text) {
	return { content: [{ type: "text", text }] };
}

async function inlineImage(path, ext) {
	const data = (await readFile(path)).toString("base64");
	return {
		type: "image",
		data,
		mimeType: ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png",
	};
}

async function toolGenerateImage(args) {
	const model = await resolveModel(args.model, ["qwen-image"]);
	const body = { model, prompt: args.prompt, n: args.n ?? 1, output_format: args.output_format ?? "png" };
	if (args.size) body.size = args.size;
	if (args.quality) body.quality = args.quality;
	if (args.style) body.style = args.style;

	const { maasRequest } = await import("origin-power-media-gen-core");
	const createRes = await maasRequest("/api/v3/images", {
		method: "POST", body, headers: { "x-ai-eg-model": model },
	});
	const taskId = createRes.body?.data?.id;
	if (!taskId) throw new MaasError("创建任务未返回 data.id", 500, createRes.body);

	const result = await pollTask("image-gen", taskId, { timeoutMs: 5 * 60_000 });
	if (result.status === "failed") {
		const err = result.info.error;
		throw new MaasError(`文生图任务失败: ${err?.code || ""} ${err?.message || "unknown"}（失败任务不计费）`, 500, result.body);
	}
	if (result.status === "cancelled") throw new MaasError("文生图任务已被取消", 409, result.body);

	const ext = args.output_format ?? "png";
	const outDir = resolveOutputDir("images", args.output_dir);
	const files = [];
	for (let i = 0; i < result.info.urls.length; i++) {
		files.push(await downloadFile(result.info.urls[i], join(outDir, `${taskId}_${i}.${ext}`)));
	}

	const content = [{
		type: "text",
		text: `文生图完成（task_id: ${taskId}，模型 ${model}，耗时 ${Math.round(result.elapsedMs / 1000)}s）。\n` +
			files.map((f) => `已保存: ${f.path} (${Math.round(f.bytes / 1024)} KB)`).join("\n"),
	}];
	for (const f of files.slice(0, 4)) content.push(await inlineImage(f.path, ext));
	return { content };
}

async function toolEditImage(args) {
	if (!Array.isArray(args.images) || args.images.length < 1 || args.images.length > 4) {
		throw new MaasError("输入图片数量需为 1-4 张", 400, undefined);
	}
	const model = await resolveModel(args.model, ["qwen-image"]);
	const { maasRequest } = await import("origin-power-media-gen-core");
	const resolved = await Promise.all(args.images.map(async (src) => {
		const r = await readLocalImageBase64(src);
		return r.url ?? r.base64;
	}));

	const createRes = await maasRequest("/api/v3/images/edits", {
		method: "POST",
		body: {
			model,
			images: resolved,
			prompt: args.prompt,
			n: args.n ?? 1,
			output_format: args.output_format ?? "png",
			...(args.size ? { size: args.size } : {}),
			...(args.quality ? { quality: args.quality } : {}),
			...(args.input_fidelity ? { input_fidelity: args.input_fidelity } : {}),
		},
	});
	const taskId = createRes.body?.data?.id;
	if (!taskId) throw new MaasError("创建任务未返回 data.id", 500, createRes.body);

	const result = await pollTask("image-edit", taskId, { timeoutMs: 5 * 60_000 });
	if (result.status === "failed") {
		const err = result.info.error;
		throw new MaasError(`图片编辑任务失败: ${err?.code || ""} ${err?.message || "unknown"}（失败任务不计费）`, 500, result.body);
	}
	if (result.status === "cancelled") throw new MaasError("图片编辑任务已被取消", 409, result.body);

	const ext = args.output_format ?? "png";
	const outDir = resolveOutputDir("images", args.output_dir);
	const files = [];
	for (let i = 0; i < result.info.urls.length; i++) {
		files.push(await downloadFile(result.info.urls[i], join(outDir, `${taskId}_${i}.${ext}`)));
	}

	const content = [{
		type: "text",
		text: `图片编辑完成（task_id: ${taskId}，模型 ${model}，耗时 ${Math.round(result.elapsedMs / 1000)}s）。\n` +
			files.map((f) => `已保存: ${f.path} (${Math.round(f.bytes / 1024)} KB)`).join("\n"),
	}];
	for (const f of files.slice(0, 4)) content.push(await inlineImage(f.path, ext));
	return { content };
}

async function toolGenerateVideo(args) {
	const model = await resolveModel(args.model, ["minimax", "video"]);
	const duration = args.duration_seconds ?? 6;
	if (duration < 4 || duration > 15 || !Number.isInteger(duration)) {
		throw new MaasError("duration_seconds 需为 4-15 的整数", 422, undefined);
	}
	const body = {
		model,
		prompt: args.prompt,
		duration_seconds: duration,
		resolution: (args.resolution || "768P").toUpperCase(),
		ratio: args.ratio || "16:9",
		num_inference_steps: args.num_inference_steps ?? 50,
	};
	if (args.seed !== undefined) body.seed = args.seed;
	if (args.input_reference) body.input_reference = await toFrameRef(args.input_reference);
	if (args.last_frame_reference) body.last_frame_reference = await toFrameRef(args.last_frame_reference);

	const { maasRequest } = await import("origin-power-media-gen-core");
	// 429 退避重试（在途任务 >2 或限流）
	let createRes;
	for (let attempt = 0; ; attempt++) {
		try {
			createRes = await maasRequest("/api/v3/videos", { method: "POST", body });
			break;
		} catch (e) {
			if (e instanceof MaasError && e.status === 429 && attempt < 2) {
				await sleep(30_000);
				continue;
			}
			throw e;
		}
	}
	const taskId = createRes.body?.data?.id;
	if (!taskId) throw new MaasError("创建任务未返回 data.id", 500, createRes.body);

	const result = await pollTask("video", taskId, { timeoutMs: 15 * 60_000 });
	if (result.status === "failed") {
		const err = result.info.error;
		throw new MaasError(`视频任务失败: ${err?.code || err?.message || "unknown"}`, 500, result.body);
	}
	if (result.status === "cancelled") throw new MaasError("视频任务已被取消", 409, result.body);

	const url = result.info.urls[0];
	if (!url) throw new MaasError("任务成功但未返回下载链接", 500, result.body);
	const outDir = resolveOutputDir("videos", args.output_dir);
	const file = await downloadFile(url, join(outDir, `${taskId}.mp4`));

	return textContent(
		`视频生成完成（task_id: ${taskId}，模型 ${model}，耗时 ${Math.round(result.elapsedMs / 1000)}s）。\n` +
		`已保存: ${file.path} (${Math.round((file.bytes / 1024 / 1024) * 10) / 10} MB)`
	);
}

async function toolGenerateMusic(args) {
	if (!args.input?.trim()) throw new MaasError("input（歌词）不能为空", 422, undefined);
	if (!args.instructions?.trim()) throw new MaasError("instructions（风格描述）不能为空字符串", 422, undefined);

	const body = {
		model: "MiniMax-Music3",
		input: args.input,
		instructions: args.instructions,
		max_new_tokens: args.max_new_tokens ?? 3000,
	};
	if (args.seed !== undefined) body.seed = args.seed;

	const { maasRequest } = await import("origin-power-media-gen-core");
	const createRes = await maasRequest("/api/v3/musics", { method: "POST", body });
	const taskId = createRes.body?.data?.id;
	if (!taskId) throw new MaasError("创建任务未返回 data.id", 500, createRes.body);

	const result = await pollTask("music", taskId, { timeoutMs: 10 * 60_000 });
	if (result.status === "failed") {
		const err = result.info.error;
		throw new MaasError(`音乐任务失败: ${err?.code || err?.message || "unknown"}（失败自动退费）`, 500, result.body);
	}
	if (result.status === "cancelled") throw new MaasError("音乐任务已被取消", 409, result.body);

	const audioUrl = result.info.audioUrl || result.info.urls[0];
	if (!audioUrl) throw new MaasError("任务成功但未返回音频链接", 500, result.body);
	const outDir = resolveOutputDir("musics", args.output_dir);
	const file = await downloadFile(audioUrl, join(outDir, `${taskId}.wav`));

	return textContent(
		`音乐生成完成（task_id: ${taskId}，耗时 ${Math.round(result.elapsedMs / 1000)}s）。\n` +
		`已保存: ${file.path} (${Math.round((file.bytes / 1024 / 1024) * 10) / 10} MB，WAV)`
	);
}

async function toolTaskStatus(args) {
	const kind = args.kind === "image" ? "image-gen" : args.kind || guessKind(args.task_id);
	if (!kind) {
		throw new MaasError(`无法从 task_id "${args.task_id}" 推断任务类型，请通过 kind 参数显式指定`, 400, undefined);
	}
	let cancelNote = "";
	if (args.cancel) {
		cancelNote = await cancelTask(kind, args.task_id);
	}
	const { maasRequest } = await import("origin-power-media-gen-core");
	const res = await maasRequest(taskQueryPath(kind, args.task_id), { timeoutMs: 30_000 });
	const status = normalizeStatus(extractStatus(res.body) || "unknown");
	const statusNote = {
		queued: "（排队中，计费预扣；queued 可取消且不计费）",
		running: "（生成中，不可取消）",
		succeeded: "（已完成）",
		failed: "（已失败，不计费/自动退费）",
		cancelled: "（已取消）",
	}[status] || "";
	return textContent(
		`任务 ${args.task_id}（${kind}）：${status}${statusNote}` + (cancelNote ? `\n${cancelNote}` : "")
	);
}

// ---------- MCP 协议 ----------

const TOOLS = [
	{
		name: "generate_image",
		description: "通过 Origin Power MaaS 平台提交文生图任务（Qwen-Image-2.1-Turbo，异步）。自动轮询直至完成，产物下载保存到本地并以内嵌图片返回。典型耗时 10-60 秒，失败不计费。",
		inputSchema: {
			type: "object",
			properties: {
				prompt: { type: "string", description: "文生图提示词，不能为空" },
				model: { type: "string", description: "模型 ID，默认 Qwen-Image-2.1-Turbo；需在白名单内" },
				n: { type: "integer", description: "输出张数 1-10，按张计费", default: 1 },
				size: { type: "string", description: "输出尺寸，如 1024x1024 / 1536x1024 / 1024x1536" },
				quality: { type: "string", description: "画质档位" },
				style: { type: "string", description: "风格" },
				output_format: { type: "string", description: "输出格式 png/jpeg/webp", default: "png" },
				output_dir: { type: "string", description: "产物保存目录（默认 ~/.media-gen/images）" },
			},
			required: ["prompt"],
		},
	},
	{
		name: "edit_image",
		description: "通过 Origin Power MaaS 平台提交图片编辑任务（Qwen-Image-2.1-Turbo，异步）：在原图上按指令修改。本地文件路径自动转 Base64 上传，也支持公网 URL。1-4 张输入图。",
		inputSchema: {
			type: "object",
			properties: {
				images: { type: "array", items: { type: "string" }, description: "输入图片：本地文件路径或 http(s) URL，1-4 张，顺序即输入顺序" },
				prompt: { type: "string", description: "编辑指令：描述要在原图上做的修改" },
				model: { type: "string", description: "模型 ID，默认 Qwen-Image-2.1-Turbo" },
				n: { type: "integer", description: "输出图片数量", default: 1 },
				size: { type: "string", description: "输出尺寸（如 1024x1024）" },
				quality: { type: "string", description: "画质档位" },
				input_fidelity: { type: "string", description: "输入保真度" },
				output_format: { type: "string", description: "输出格式 png/jpeg/webp", default: "png" },
				output_dir: { type: "string", description: "产物保存目录" },
			},
			required: ["images", "prompt"],
		},
	},
	{
		name: "generate_video",
		description: "通过 Origin Power MaaS 平台提交视频生成任务（minimax-h3，异步）。支持首/尾帧参考图（图生视频）。典型耗时 1-5 分钟，自动轮询并下载落盘。在途任务超过 2 个会被限流（自动退避重试）。",
		inputSchema: {
			type: "object",
			properties: {
				prompt: { type: "string", description: "提示词，推荐「场景+主体+动作+运镜+风格」五要素写法" },
				model: { type: "string", description: "模型 ID，默认 minimax-h3" },
				duration_seconds: { type: "integer", description: "视频时长（秒），4-15 整数，默认 6（24fps）", default: 6 },
				resolution: { type: "string", description: "分辨率档位，当前仅 768P", default: "768P" },
				ratio: { type: "string", description: "画面比例，默认 16:9；adaptive 仅图生视频", default: "16:9" },
				num_inference_steps: { type: "integer", description: "去噪步数，默认 50，速度优先可降至 8-12", default: 50 },
				seed: { type: "integer", description: "随机种子（0 = 随机）" },
				input_reference: { type: "string", description: "首帧图片：本地文件路径（自动转 Data URI）或公网 URL" },
				last_frame_reference: { type: "string", description: "尾帧图片：本地文件路径或 URL；需与首帧宽高比一致" },
				output_dir: { type: "string", description: "产物保存目录" },
			},
			required: ["prompt"],
		},
	},
	{
		name: "generate_music",
		description: "通过 Origin Power MaaS 平台提交文生音乐任务（MiniMax-Music3，输出 WAV）。歌词必须提供（模型逐字演唱原文，不代写）；instructions 为风格描述必填。自动轮询并下载落盘。",
		inputSchema: {
			type: "object",
			properties: {
				input: { type: "string", description: "歌词（逐字演唱，不代写）。支持段落标签 [Intro]/[Verse]/[Chorus]/[Bridge]/[Outro] 等；纯音乐用 [Inst]" },
				instructions: { type: "string", description: "风格描述，非空，如「流行,女声,钢琴,温暖的,中速」" },
				max_new_tokens: { type: "integer", description: "时长上限 token 数（25 token ≈ 1 秒，是上限而非目标）", default: 3000 },
				seed: { type: "integer", description: "随机种子（0 = 随机）" },
				output_dir: { type: "string", description: "产物保存目录" },
			},
			required: ["input", "instructions"],
		},
	},
	{
		name: "task_status",
		description: "查询 Origin Power MaaS 异步任务（图片/视频/音乐）的当前状态，或取消任务。生成工具已内置轮询，通常用于会话中断后恢复查询或取消排队中的任务。",
		inputSchema: {
			type: "object",
			properties: {
				task_id: { type: "string", description: "任务 ID（image_/video_/music_ 前缀）" },
				kind: { type: "string", enum: ["image", "image-edit", "video", "music"], description: "任务类型；缺省按前缀自动推断" },
				cancel: { type: "boolean", description: "为 true 时取消该任务（仅 queued 可退费取消）" },
			},
			required: ["task_id"],
		},
	},
];

const TOOL_HANDLERS = {
	generate_image: toolGenerateImage,
	edit_image: toolEditImage,
	generate_video: toolGenerateVideo,
	generate_music: toolGenerateMusic,
	task_status: toolTaskStatus,
};

function reply(id, result) {
	process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function replyError(id, code, message) {
	process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
	line = line.trim();
	if (!line) return;
	let msg;
	try {
		msg = JSON.parse(line);
	} catch {
		return;
	}
	const { id, method, params } = msg;
	try {
		switch (method) {
			case "initialize":
				reply(id, {
					protocolVersion: params?.protocolVersion || "2025-06-18",
					capabilities: { tools: {} },
					serverInfo: { name: "origin-power-media-gen", version: "1.0.0" },
				});
				break;
			case "notifications/initialized":
				break;
			case "ping":
				reply(id, {});
				break;
			case "tools/list":
				reply(id, { tools: TOOLS });
				break;
			case "tools/call": {
				const { name, arguments: args } = params || {};
				const handler = TOOL_HANDLERS[name];
				if (!handler) {
					replyError(id, -32602, `Unknown tool: ${name}`);
					break;
				}
				try {
					const result = await handler(args || {});
					reply(id, { ...result, isError: false });
				} catch (e) {
					reply(id, {
						content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
						isError: true,
					});
				}
				break;
			}
			default:
				if (id !== undefined) replyError(id, -32601, `Method not found: ${method}`);
		}
	} catch (e) {
		if (id !== undefined) replyError(id, -32603, e instanceof Error ? e.message : String(e));
	}
});

process.on("SIGINT", () => process.exit(0));
process.stderr.write(`[origin-power-media-gen-mcp] ready (${config.baseUrl})\n`);
