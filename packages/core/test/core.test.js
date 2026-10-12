import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStatus, extractStatus, extractResults, guessKind, taskQueryPath } from "../index.js";

test("normalizeStatus: 音乐 completed → succeeded", () => {
	assert.equal(normalizeStatus("completed"), "succeeded");
});

test("normalizeStatus: 音乐 processing → running", () => {
	assert.equal(normalizeStatus("processing"), "running");
});

test("normalizeStatus: 其他状态透传", () => {
	assert.equal(normalizeStatus("queued"), "queued");
	assert.equal(normalizeStatus("succeeded"), "succeeded");
});

test("extractStatus: 三种响应结构", () => {
	assert.equal(extractStatus({ status: "queued" }), "queued");
	assert.equal(extractStatus({ data: { status: "running" } }), "running");
	assert.equal(extractStatus({ task: { status: "succeeded" } }), "succeeded");
});

test("extractResults: 图片任务实测结构 task.content.results", () => {
	const r = extractResults("image-gen", {
		task: { content: { results: [{ url: "http://x/a.png" }, { url: "http://x/b.png" }] } },
	});
	assert.deepEqual(r.urls, ["http://x/a.png", "http://x/b.png"]);
});

test("extractResults: 图片任务文档结构 data.images 兼容", () => {
	const r = extractResults("image-gen", { data: { images: [{ url: "http://x/a.png" }] } });
	assert.deepEqual(r.urls, ["http://x/a.png"]);
});

test("extractResults: 视频 task.content.results + error", () => {
	const r = extractResults("video", {
		task: { content: { results: [{ url: "http://x/v.mp4" }] }, error: { code: "X" } },
	});
	assert.deepEqual(r.urls, ["http://x/v.mp4"]);
	assert.equal(r.error.code, "X");
});

test("extractResults: 音乐 audioUrl 指向第一个 URL（WAV）", () => {
	const r = extractResults("music", { task: { content: { results: [{ url: "http://x/a.wav" }] } } });
	assert.equal(r.audioUrl, "http://x/a.wav");
});

test("guessKind: 前缀推断", () => {
	assert.equal(guessKind("video_abc"), "video");
	assert.equal(guessKind("music_abc"), "music");
	assert.equal(guessKind("image_abc"), "image-gen");
	assert.equal(guessKind("unknown_abc"), undefined);
});

test("taskQueryPath: 各类型查询路径", () => {
	assert.equal(taskQueryPath("image-gen", "t"), "/api/v3/images/tasks/t");
	assert.equal(taskQueryPath("image-edit", "t"), "/api/v3/images/edits/tasks/t");
	assert.equal(taskQueryPath("video", "t"), "/api/v3/videos/t");
	assert.equal(taskQueryPath("music", "t"), "/api/v3/musics/t");
});
