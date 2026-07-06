import { strToU8, zipSync } from "fflate";
import type { VivgridFileContent, VivgridFileMap } from "./types";

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "");
}

function toUint8Array(content: VivgridFileContent): Uint8Array {
  if (typeof content === "string") {
    return strToU8(content);
  }
  if (content instanceof Uint8Array) {
    return content;
  }
  return new Uint8Array(content);
}

export function getDefaultGeneratedToolTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "esnext",
        module: "nodenext",
        moduleResolution: "nodenext",
        types: ["node"],
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        outDir: "./dist",
        rootDir: "./",
      },
      include: ["main.ts", "src/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2,
  )}\n`;
}

export function ensureDefaultTsconfig(files: VivgridFileMap): VivgridFileMap {
  if (files["tsconfig.json"]) {
    return files;
  }

  return {
    ...files,
    "tsconfig.json": getDefaultGeneratedToolTsconfig(),
  };
}

export function buildZipFromFiles(files: VivgridFileMap): Uint8Array {
  const zipEntries: Record<string, Uint8Array> = {};

  for (const [path, content] of Object.entries(files)) {
    const normalized = normalizePath(path);
    if (!normalized) {
      throw new Error("Invalid file path: path cannot be empty");
    }

    zipEntries[normalized] = toUint8Array(content);
  }

  return zipSync(zipEntries, { level: 6 });
}
