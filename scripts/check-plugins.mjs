#!/usr/bin/env node
/**
 * Validate the generated plugin trees and keep source-level duplication out.
 */

import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const errors = [];

function check(condition, message) {
	if (!condition) errors.push(message);
}

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

async function validateBundledCli(target) {
	const cliPath = join(repoRoot, "dist", "plugins", target, "scripts", "media-gen.mjs");
	const corePath = join(repoRoot, "dist", "plugins", target, "scripts", "core", "index.js");
	const skillPath = join(repoRoot, "dist", "plugins", target, "skills", "origin-power-media-gen", "SKILL.md");

	check(await exists(cliPath), `${target}: missing bundled CLI at ${cliPath}`);
	check(await exists(corePath), `${target}: missing bundled core at ${corePath}`);
	check(await exists(skillPath), `${target}: missing bundled skill at ${skillPath}`);

	if (await exists(cliPath)) {
		const cli = await readFile(cliPath, "utf8");
		check(!cli.includes('from "origin-power-media-gen-core"'), `${target}: bundled CLI still imports npm core`);
		check(cli.includes('from "./core/index.js"'), `${target}: bundled CLI does not import vendored core`);
	}
}

async function validateAdapterIsThin(adapterDir, label) {
	const legacyScripts = join(adapterDir, "scripts");
	const legacySkills = join(adapterDir, "skills");
	check(!(await exists(legacyScripts)), `${label}: legacy scripts directory should not exist`);
	check(!(await exists(legacySkills)), `${label}: legacy skills directory should not exist`);
}

const cliPackage = await readJson(join(repoRoot, "packages", "cli", "package.json"));
const codexManifest = await readJson(join(repoRoot, "dist", "plugins", "codex", ".codex-plugin", "plugin.json"));
const zcodeManifest = await readJson(join(repoRoot, "dist", "plugins", "zcode", ".zcode-plugin", "plugin.json"));

check(codexManifest.version === cliPackage.version, `codex plugin version ${codexManifest.version} != CLI version ${cliPackage.version}`);
check(zcodeManifest.version === cliPackage.version, `zcode plugin version ${zcodeManifest.version} != CLI version ${cliPackage.version}`);

await validateAdapterIsThin(join(repoRoot, "adapters", "codex"), "codex adapter");
await validateAdapterIsThin(join(repoRoot, "adapters", "zcode", "origin-power-media-gen"), "zcode adapter");

await validateBundledCli("codex");
await validateBundledCli("zcode");

if (errors.length > 0) {
	for (const error of errors) console.error(`ERROR: ${error}`);
	process.exitCode = 1;
} else {
	console.log("Plugin artifacts look good.");
}
