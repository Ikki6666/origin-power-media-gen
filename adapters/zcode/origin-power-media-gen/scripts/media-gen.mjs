#!/usr/bin/env node
/**
 * origin-power-media-gen CLI（ZCode 插件形态，无 MCP）
 *
 * 随插件分发的媒体生成命令行：文生图 / 图片编辑 / 视频 / 音乐（Origin Power MaaS 平台）。
 * 业务逻辑来自 vendored 的 packages/core 副本（scripts/core/，与 monorepo 的 packages/core 保持同步）。
 *
 * 子命令：
 *   image  <prompt>            文生图（一步完成：创建 + 轮询 + 下载）
 *   edit   <prompt> --images   图片编辑（本地路径/URL，1-4 张）
 *   music  <lyrics> --style    音乐生成（歌词逐字演唱，风格必填）
 *   video  <prompt>            视频生成（默认只提交；--wait 同步等待并下载）
 *   status <task_id>           查询任务（--wait 等到终态并自动下载；--cancel 取消）
 *   models                     列出当前 Key 可用且在白名单内的模型
 *
 * 输出：默认人类可读 key: value 行；--json 输出 JSON。
 * 退出码：0 成功；1 业务失败（stderr 带原因与建议）；2 用法错误。
 */

import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import {
	MaasError,
	config,
	resolveOutputDir,
	listModels,
	resolveModel,
	maasRequest,
	pollTask,
	downloadFile,
	cancelTask,
	guessKind,
	taskQueryPath,
	extractStatus,
	normalizeStatus,
	sleep,
} from "./core/index.js";

class UsageError extends Error {}

// ---------- 参数解析 ----------

const BOOL_FLAGS = new Set(["wait", "cancel", "json", "help"]);

function parseArgs(argv) {
	const flags = {};
	const positional = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("--")) {
			positional.push(arg);
			continue;
		}
		const key = arg.slice(2);
		if (BOOL_FLAGS.has(key)) {
			flags[key] = true;
			continue;
		}
		const value = argv[i + 1];
		if (value === undefined || value.startsWith("--")) {
			throw new UsageError(`--${key} 需要一个值`);
		}
		flags[key] = value;
		i++;
	}
	return { flags, positional };
}

function intFlag(flags, name, fallback) {
	if (flags[name] === undefined) return fallback;
	const n = Number.parseInt(flags[name], 10);
	if (!Number.isInteger(n)) throw new UsageError(`--${name} 需为整数，收到: ${flags[name]}`);
	return n;
}

// ---------- 输出 ----------

function emit(flags, data, humanLines) {
	if (flags.json) {
		process.stdout.write(JSON.stringify(data, null, 2) + "\n");
	} else {
		for (const line of humanLines) process.stdout.write(line + "\n");
	}
}

function note(text) {
	process.stderr.write(`[media-gen] ${text}\n`);
}

/** 轮询到终态；进度走 stderr，不污染 stdout 的机器可读输出 */
function runTask(kind, taskId, timeoutMs) {
	return pollTask(kind, taskId, {
		timeoutMs,
		onUpdate: (status, elapsedMs) => note(`状态 ${status}（已等待 ${Math.round(elapsedMs / 1000)}s）`),
	});
}

/** 终态校验：失败/取消抛 MaasError（消息含平台错误码） */
function assertSucceeded(label, result) {
	if (result.status === "failed") {
		const err = result.info.error;
		throw new MaasError(`${label}任务失败: ${err?.code || ""} ${err?.message || "unknown"}（失败任务不计费）`, 500, result.body);
	}
	if (result.status === "cancelled") {
		throw new MaasError(`${label}任务已被取消`, 409, result.body);
	}
}

function parseSeed(flags) {
	if (flags.seed === undefined) return undefined;
	const seed = Number.parseInt(flags.seed, 10);
	if (!Number.isInteger(seed)) throw new UsageError(`--seed 需为整数，收到: ${flags.seed}`);
	return seed;
}

// ---------- 输入图片（本地路径 → Base64 / Data URI） ----------

async function readLocalImageBase64(src) {
	if (/^https?:\/\//i.test(src)) return { url: src };
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
	const path = src.startsWith("~/") ? join(process.env.HOME || "", src.slice(2)) : src;
	const buf = await readFile(path).catch(() => {
		throw new MaasError(`参考帧图片不存在或不可读: ${path}`, 400, undefined);
	});
	return `data:image/png;base64,${buf.toString("base64")}`;
}

// ---------- 工具实现 ----------

async function cmdImage({ flags, positional }) {
	const prompt = positional.join(" ").trim();
	if (!prompt) throw new UsageError('image 需要提示词。例：node media-gen.mjs image "画一只橘猫在雪地里打滚"');
	const n = intFlag(flags, "n", 1);
	if (n < 1 || n > 10) throw new UsageError("--n 需为 1-10 的整数（按张计费）");
	const model = await resolveModel(flags.model, ["qwen-image"]);
	const body = { model, prompt, n, output_format: flags.format || "png" };
	if (flags.size) body.size = flags.size;
	if (flags.quality) body.quality = flags.quality;
	if (flags.style) body.style = flags.style;

	note(`提交文生图任务（模型 ${model}，${n} 张）…`);
	const createRes = await maasRequest("/api/v3/images", {
		method: "POST",
		body,
		headers: { "x-ai-eg-model": model },
	});
	const taskId = createRes.body?.data?.id;
	if (!taskId) throw new MaasError("创建任务未返回 data.id", 500, createRes.body);

	const result = await runTask("image-gen", taskId, 5 * 60_000);
	assertSucceeded("文生图", result);

	const ext = flags.format || "png";
	const outDir = resolveOutputDir("images", flags.out);
	const paths = [];
	for (let i = 0; i < result.info.urls.length; i++) {
		const f = await downloadFile(result.info.urls[i], join(outDir, `${taskId}_${i}.${ext}`));
		paths.push(f.path);
	}
	emit(
		flags,
		{ task_id: taskId, model, status: "succeeded", paths, elapsed_s: Math.round(result.elapsedMs / 1000) },
		[
			`文生图完成（task_id: ${taskId}，模型 ${model}，耗时 ${Math.round(result.elapsedMs / 1000)}s）`,
			...paths.map((p) => `saved: ${p}`),
		],
	);
}

async function cmdEdit({ flags, positional }) {
	const prompt = positional.join(" ").trim();
	if (!prompt) throw new UsageError('edit 需要编辑指令。例：node media-gen.mjs edit "把背景换成雪山" --images ./cat.png');
	if (!flags.images) throw new UsageError("edit 需要 --images <本地路径或URL，逗号分隔，1-4 张>");
	const images = flags.images.split(",").map((s) => s.trim()).filter(Boolean);
	if (images.length < 1 || images.length > 4) throw new UsageError("--images 需为 1-4 张（逗号分隔）");
	const n = intFlag(flags, "n", 1);
	if (n < 1 || n > 10) throw new UsageError("--n 需为 1-10 的整数");
	const model = await resolveModel(flags.model, ["qwen-image"]);
	const resolved = await Promise.all(images.map(async (src) => {
		const r = await readLocalImageBase64(src);
		return r.url ?? r.base64;
	}));
	const body = { model, images: resolved, prompt, n, output_format: flags.format || "png" };
	if (flags.size) body.size = flags.size;
	if (flags.quality) body.quality = flags.quality;
	if (flags.fidelity) body.input_fidelity = flags.fidelity;

	note(`提交图片编辑任务（模型 ${model}，输入 ${images.length} 张）…`);
	const createRes = await maasRequest("/api/v3/images/edits", { method: "POST", body });
	const taskId = createRes.body?.data?.id;
	if (!taskId) throw new MaasError("创建任务未返回 data.id", 500, createRes.body);

	const result = await runTask("image-edit", taskId, 5 * 60_000);
	assertSucceeded("图片编辑", result);

	const ext = flags.format || "png";
	const outDir = resolveOutputDir("images", flags.out);
	const paths = [];
	for (let i = 0; i < result.info.urls.length; i++) {
		const f = await downloadFile(result.info.urls[i], join(outDir, `${taskId}_${i}.${ext}`));
		paths.push(f.path);
	}
	emit(
		flags,
		{ task_id: taskId, model, status: "succeeded", paths, elapsed_s: Math.round(result.elapsedMs / 1000) },
		[
			`图片编辑完成（task_id: ${taskId}，模型 ${model}，耗时 ${Math.round(result.elapsedMs / 1000)}s）`,
			...paths.map((p) => `saved: ${p}`),
		],
	);
}

async function cmdMusic({ flags, positional }) {
	const input = positional.join(" ").trim();
	if (!input) throw new UsageError('music 需要歌词（模型逐字演唱，不代写）。例：node media-gen.mjs music "[Verse]..." --style "流行,女声,钢琴"');
	const instructions = flags.style;
	if (!instructions?.trim()) throw new UsageError('music 需要 --style <风格描述>（非空），如 --style "流行,女声,钢琴,温暖的,中速"');
	const body = { model: "MiniMax-Music3", input, instructions, max_new_tokens: intFlag(flags, "tokens", 3000) };
	const seed = parseSeed(flags);
	if (seed !== undefined) body.seed = seed;

	note("提交音乐生成任务（模型 MiniMax-Music3）…");
	const createRes = await maasRequest("/api/v3/musics", { method: "POST", body });
	const taskId = createRes.body?.data?.id;
	if (!taskId) throw new MaasError("创建任务未返回 data.id", 500, createRes.body);

	const result = await runTask("music", taskId, 10 * 60_000);
	assertSucceeded("音乐", result);

	const audioUrl = result.info.audioUrl || result.info.urls[0];
	if (!audioUrl) throw new MaasError("任务成功但未返回音频链接", 500, result.body);
	const outDir = resolveOutputDir("musics", flags.out);
	const f = await downloadFile(audioUrl, join(outDir, `${taskId}.wav`));
	emit(
		flags,
		{ task_id: taskId, status: "succeeded", paths: [f.path], elapsed_s: Math.round(result.elapsedMs / 1000) },
		[`音乐生成完成（task_id: ${taskId}，耗时 ${Math.round(result.elapsedMs / 1000)}s）`, `saved: ${f.path}`],
	);
}

async function cmdVideo({ flags, positional }) {
	const prompt = positional.join(" ").trim();
	if (!prompt) throw new UsageError('video 需要提示词。例：node media-gen.mjs video "海边日落，镜头缓推"');
	const duration = intFlag(flags, "duration", 6);
	if (duration < 4 || duration > 15) throw new UsageError("--duration 需为 4-15 的整数秒");
	const model = await resolveModel(flags.model, ["minimax", "video"]);
	const body = {
		model,
		prompt,
		duration_seconds: duration,
		resolution: (flags.resolution || "768P").toUpperCase(),
		ratio: flags.ratio || "16:9",
		num_inference_steps: intFlag(flags, "steps", 50),
	};
	const seed = parseSeed(flags);
	if (seed !== undefined) body.seed = seed;
	if (flags["first-frame"]) body.input_reference = await toFrameRef(flags["first-frame"]);
	if (flags["last-frame"]) body.last_frame_reference = await toFrameRef(flags["last-frame"]);

	note(`提交视频任务（模型 ${model}，${duration}s，${body.resolution}，${body.ratio}）…`);
	// 429 退避重试（在途任务 >2 或限流）
	let createRes;
	for (let attempt = 0; ; attempt++) {
		try {
			createRes = await maasRequest("/api/v3/videos", { method: "POST", body });
			break;
		} catch (e) {
			if (e instanceof MaasError && e.status === 429 && attempt < 2) {
				note("被限流（429），30 秒后重试…");
				await sleep(30_000);
				continue;
			}
			throw e;
		}
	}
	const taskId = createRes.body?.data?.id;
	if (!taskId) throw new MaasError("创建任务未返回 data.id", 500, createRes.body);

	if (!flags.wait) {
		emit(flags, { task_id: taskId, model, status: "submitted" }, [
			`视频任务已提交（task_id: ${taskId}，模型 ${model}）。典型耗时 1-5 分钟。`,
			`等待并下载：node media-gen.mjs status ${taskId} --wait`,
			`仅查询：node media-gen.mjs status ${taskId}`,
			`取消（仅 queued 可退费取消）：node media-gen.mjs status ${taskId} --cancel`,
		]);
		return;
	}

	const result = await runTask("video", taskId, 15 * 60_000);
	assertSucceeded("视频", result);
	const url = result.info.urls[0];
	if (!url) throw new MaasError("任务成功但未返回下载链接", 500, result.body);
	const outDir = resolveOutputDir("videos", flags.out);
	const f = await downloadFile(url, join(outDir, `${taskId}.mp4`));
	emit(
		flags,
		{ task_id: taskId, model, status: "succeeded", paths: [f.path], elapsed_s: Math.round(result.elapsedMs / 1000) },
		[
			`视频生成完成（task_id: ${taskId}，模型 ${model}，耗时 ${Math.round(result.elapsedMs / 1000)}s）`,
			`saved: ${f.path}`,
		],
	);
}

async function cmdStatus({ flags, positional }) {
	const taskId = positional[0];
	if (!taskId) throw new UsageError("status 需要 task_id。例：node media-gen.mjs status video_xxx --wait");
	const kind = flags.kind === "image" ? "image-gen" : flags.kind || guessKind(taskId);
	if (!kind) {
		throw new UsageError(`无法从 task_id "${taskId}" 推断任务类型，请用 --kind image|image-edit|video|music 显式指定`);
	}

	let cancelNote = "";
	if (flags.cancel) cancelNote = await cancelTask(kind, taskId);

	if (!flags.wait) {
		const res = await maasRequest(taskQueryPath(kind, taskId), { timeoutMs: 30_000 });
		const status = normalizeStatus(extractStatus(res.body) || "unknown");
		emit(
			flags,
			{ task_id: taskId, kind, status, cancel_note: cancelNote || undefined },
			[`任务 ${taskId}（${kind}）：${status}${cancelNote ? `\n${cancelNote}` : ""}`],
		);
		return;
	}

	const timeoutMs = flags.timeout ? intFlag(flags, "timeout", 15) * 1000 : 15 * 60_000;
	const result = await runTask(kind, taskId, timeoutMs);

	if (result.status !== "succeeded") {
		const err = result.info.error;
		emit(
			flags,
			{ task_id: taskId, kind, status: result.status, error: err?.message, cancel_note: cancelNote || undefined },
			[
				`任务 ${taskId}（${kind}）：${result.status}${cancelNote ? ` | ${cancelNote}` : ""}`,
				err ? `平台错误: ${err.code || ""} ${err.message || "unknown"}`.trim() : undefined,
			].filter(Boolean),
		);
		process.exitCode = 1;
		return;
	}

	const outDir = resolveOutputDir(kind === "video" ? "videos" : kind === "music" ? "musics" : "images", flags.out);
	const paths = [];
	if (kind === "video") {
		const url = result.info.urls[0];
		if (url) paths.push((await downloadFile(url, join(outDir, `${taskId}.mp4`))).path);
	} else if (kind === "music") {
		const audioUrl = result.info.audioUrl || result.info.urls[0];
		if (audioUrl) paths.push((await downloadFile(audioUrl, join(outDir, `${taskId}.wav`))).path);
	} else {
		for (let i = 0; i < result.info.urls.length; i++) {
			paths.push((await downloadFile(result.info.urls[i], join(outDir, `${taskId}_${i}.png`))).path);
		}
	}
	emit(
		flags,
		{ task_id: taskId, kind, status: "succeeded", paths, cancel_note: cancelNote || undefined },
		[
			`任务 ${taskId}（${kind}）：succeeded${cancelNote ? ` | ${cancelNote}` : ""}`,
			...paths.map((p) => `saved: ${p}`),
		],
	);
}

async function cmdModels({ flags }) {
	const ids = await listModels();
	const visible = ids.filter((id) => config.supportedModels.includes(id));
	emit(
		flags,
		{ models: visible },
		[`当前 Key 可用且在白名单内的模型（${visible.length}）：`, ...visible.map((m) => `  - ${m}`)],
	);
}

// ---------- 入口 ----------

const USAGE = `origin-power-media-gen CLI — Origin Power MaaS 媒体生成（文生图/图片编辑/视频/音乐）

用法：node media-gen.mjs <子命令> [参数]

子命令：
  image <提示词> [--model ID] [--n 1-10] [--size 1024x1024] [--quality Q] [--style S]
        [--format png|jpeg|webp] [--out 目录] [--json]
        文生图，一步完成（创建+轮询+下载），典型 10-60 秒。
  edit <编辑指令> --images <路径或URL，逗号分隔，1-4张> [--model] [--n] [--size] [--quality]
        [--fidelity F] [--format] [--out 目录] [--json]
        图片编辑，本地路径自动转 Base64。
  music <歌词> --style <风格描述> [--tokens 3000] [--seed N] [--out 目录] [--json]
        音乐生成；歌词逐字演唱不代写，--style 必填。典型 20-60 秒。
  video <提示词> [--duration 4-15] [--ratio 16:9] [--resolution 768P] [--steps 50]
        [--seed N] [--first-frame 路径] [--last-frame 路径] [--out 目录] [--wait] [--json]
        视频生成。默认只提交并返回 task_id（典型 1-5 分钟，避免 Bash 超时）；
        --wait 同步等待到终态并下载。
  status <task_id> [--kind image|image-edit|video|music] [--wait] [--timeout 秒] [--cancel] [--json]
        查询任务；--wait 轮询到终态（成功自动下载产物）；--cancel 取消（仅 queued 可退费取消）。
  models [--json]
        列出当前 Key 可用且在白名单内的模型。

环境变量：MEDIA_GEN_API_KEY（回退 YUANLI_API_KEY / AGW_API_KEY）、MEDIA_GEN_BASE_URL、
MEDIA_GEN_MEDIA_DIR（默认 ~/.media-gen）、MEDIA_GEN_MODELS（模型白名单覆盖）。

产物落盘为绝对路径（saved: ...），可直接读取或后续引用。`;

const COMMANDS = {
	image: cmdImage,
	edit: cmdEdit,
	music: cmdMusic,
	video: cmdVideo,
	status: cmdStatus,
	models: cmdModels,
};

const [, , cmd, ...rest] = process.argv;

const HELP = cmd === "help" || cmd === "--help" || cmd === "-h";

if (!cmd) {
	process.stderr.write(USAGE + "\n");
	process.exitCode = 2;
} else if (HELP) {
	process.stdout.write(USAGE + "\n");
} else if (!COMMANDS[cmd]) {
	process.stderr.write(`未知子命令: ${cmd}\n\n${USAGE}\n`);
	process.exitCode = 2;
} else {
	try {
		const { flags, positional } = parseArgs(rest);
		await COMMANDS[cmd]({ flags, positional });
	} catch (e) {
		if (e instanceof UsageError) {
			process.stderr.write(`用法错误: ${e.message}\n\n${USAGE}\n`);
			process.exitCode = 2;
		} else {
			process.stderr.write(`错误: ${e instanceof Error ? e.message : String(e)}\n`);
			process.exitCode = 1;
		}
	}
}
