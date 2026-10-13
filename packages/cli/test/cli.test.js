import { test } from "node:test";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "media-gen.mjs");

test("CLI: --help prints the command surface", async () => {
	const { stdout } = await run(process.execPath, [cli, "--help"]);
	assert.match(stdout, /image/);
	assert.match(stdout, /edit/);
	assert.match(stdout, /video/);
	assert.match(stdout, /music/);
	assert.match(stdout, /status/);
});

test("CLI: unknown command exits 2", async () => {
	await assert.rejects(
		run(process.execPath, [cli, "not-a-command"]),
		(error) => error.code === 2,
	);
});

test("CLI: image --n 0 exits 2", async () => {
	await assert.rejects(
		run(process.execPath, [cli, "image", "test", "--n", "0"]),
		(error) => error.code === 2,
	);
});

test("CLI: video --duration 3 exits 2", async () => {
	await assert.rejects(
		run(process.execPath, [cli, "video", "test", "--duration", "3"]),
		(error) => error.code === 2,
	);
});

test("CLI: music without --style exits 2", async () => {
	await assert.rejects(
		run(process.execPath, [cli, "music", "lyrics"]),
		(error) => error.code === 2,
	);
});

test("CLI: edit without --images exits 2", async () => {
	await assert.rejects(
		run(process.execPath, [cli, "edit", "test"]),
		(error) => error.code === 2,
	);
});

test("CLI: music --seed non-integer exits 2 before network call", async () => {
	await assert.rejects(
		run(process.execPath, [cli, "music", "lyrics", "--style", "pop", "--seed", "abc"]),
		(error) => error.code === 2,
	);
});
