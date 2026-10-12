#!/usr/bin/env node
/**
 * Build Origin Power Media Gen plugin artifacts.
 *
 * Produces zero-install plugin trees under dist/plugins/<target>:
 *   dist/plugins/codex
 *   dist/plugins/zcode
 */

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const distRoot = join(repoRoot, "dist", "plugins");
const coreSource = join(repoRoot, "packages", "core");
const cliSource = join(repoRoot, "packages", "cli", "src", "media-gen.mjs");
const skillSource = join(repoRoot, "skills", "origin-power-media-gen");

async function copyCore(target) {
	const coreTarget = join(target, "scripts", "core");
	await rm(coreTarget, { recursive: true, force: true });
	await cp(coreSource, coreTarget, { recursive: true });
	await rm(join(coreTarget, "test"), { recursive: true, force: true });
}

async function copyCli(target) {
	const cliTarget = join(target, "scripts", "media-gen.mjs");
	const source = await readFile(cliSource, "utf8");
	const bundled = source.replace(
		/from "origin-power-media-gen-core"/,
		'from "./core/index.js"',
	);
	await rm(join(target, "scripts"), { recursive: true, force: true });
	await mkdir(join(target, "scripts"), { recursive: true });
	await writeFile(cliTarget, bundled, "utf8");
}

async function copySkill(target) {
	const skillTarget = join(target, "skills", "origin-power-media-gen");
	await rm(skillTarget, { recursive: true, force: true });
	await cp(skillSource, skillTarget, { recursive: true });
}

async function buildCodex() {
	const target = join(distRoot, "codex");
	await rm(target, { recursive: true, force: true });
	await mkdir(target, { recursive: true });
	await cp(join(repoRoot, "adapters", "codex", ".codex-plugin"), join(target, ".codex-plugin"), { recursive: true });
	await cp(join(repoRoot, "adapters", "codex", "docs"), join(target, "docs"), { recursive: true });
	await copyCli(target);
	await copyCore(target);
	await copySkill(target);
}

async function buildZcode() {
	const target = join(distRoot, "zcode");
	await rm(target, { recursive: true, force: true });
	await mkdir(target, { recursive: true });
	await cp(join(repoRoot, "adapters", "zcode", "origin-power-media-gen"), target, { recursive: true });
	await rm(join(target, "scripts"), { recursive: true, force: true });
	await rm(join(target, "skills"), { recursive: true, force: true });
	await copyCli(target);
	await copyCore(target);
	await copySkill(target);
}

await buildCodex();
await buildZcode();
console.log("Built plugins:");
console.log(`  ${join(distRoot, "codex")}`);
console.log(`  ${join(distRoot, "zcode")}`);
