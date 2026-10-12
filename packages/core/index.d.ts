/**
 * Origin Power MaaS 媒体生成核心客户端类型声明
 */

export type TaskKind = "image-gen" | "image-edit" | "video" | "music";

export interface MaasConfig {
	baseUrl: string;
	apiKey: string | undefined;
	mediaDir: string;
	supportedModels: string[];
}

export declare class MaasError extends Error {
	status: number;
	body: unknown;
	constructor(message: string, status: number, body: unknown);
}

export declare const config: {
	baseUrl: string;
	apiKey: string | undefined;
	mediaDir: string;
	supportedModels: string[];
};

export declare function expandTilde(p: string): string;
export declare function resolveOutputDir(subdir: string, custom?: string): string;
export declare function requireApiKey(): string;

export interface MaasResponse<T = any> {
	status: number;
	body: T;
	text: string;
}

export declare function maasRequest<T = any>(
	path: string,
	opts?: {
		method?: string;
		body?: unknown;
		headers?: Record<string, string>;
		timeoutMs?: number;
	},
): Promise<MaasResponse<T>>;

export declare function listModels(): Promise<string[]>;
export declare function resolveModel(model: string | undefined, matchKeywords: string[]): Promise<string>;

export declare function taskQueryPath(kind: TaskKind, taskId: string): string;
export declare function extractStatus(body: any): string | undefined;
export declare function normalizeStatus(raw: string): string;

export interface TaskResultInfo {
	urls: string[];
	audioUrl?: string;
	error?: { code?: string; message?: string };
}

export declare function extractResults(kind: TaskKind, body: any): TaskResultInfo;

export interface PollResult {
	taskId: string;
	kind: TaskKind;
	status: string;
	body: any;
	info: TaskResultInfo;
	elapsedMs: number;
}

export declare function pollTask(
	kind: TaskKind,
	taskId: string,
	opts?: {
		intervalMs?: number;
		timeoutMs?: number;
		onUpdate?: (status: string, elapsedMs: number) => void;
	},
): Promise<PollResult>;

export declare function downloadFile(
	url: string,
	destPath: string,
	signal?: AbortSignal,
): Promise<{ path: string; bytes: number }>;

export declare function cancelTask(kind: TaskKind, taskId: string): Promise<string>;
export declare function guessKind(taskId: string): TaskKind | undefined;
export declare function sleep(ms: number, signal?: AbortSignal): Promise<void>;
