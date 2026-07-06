export type VivgridLanguage = "go" | "node" | "auto";

export type VivgridFileContent = string | Uint8Array | ArrayBuffer;

export type VivgridFileMap = Record<string, VivgridFileContent>;

export interface VivgridSseEvent<T = unknown> {
  event: string;
  data: T | string;
  rawData: string;
}

export interface VivgridClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface BuildToolFromFilesParams {
  toolName: string;
  token: string;
  files: VivgridFileMap;
  language?: VivgridLanguage;
  includeDefaultTsconfig?: boolean;
}

export interface BuildToolFromZipParams {
  toolName: string;
  token: string;
  zipFile: Uint8Array | ArrayBuffer | Blob;
  language?: VivgridLanguage;
}

export interface CreateToolParams {
  toolName: string;
  token: string;
  envs?: Record<string, string>;
}

export interface GetToolStatusParams {
  toolName: string;
  token: string;
}

export interface StreamToolLogsParams {
  toolName: string;
  token: string;
}

export interface InvokeToolParams {
  toolName: string;
  token: string;
  args: string | Record<string, unknown>;
}

export interface RemoveToolParams {
  toolName: string;
  token: string;
}
