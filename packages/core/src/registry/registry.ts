import path from "node:path";
import { readFile } from "node:fs/promises";
import { getEmbeddedRegistryItem } from "./embedded";
import type { RegistryItem, RegistryItemV1 } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown, fieldName: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(`Invalid registry item: ${fieldName} must be string[]`);
  }
  return value;
}

function parseRegistryItemV1(raw: unknown): RegistryItemV1 {
  if (!isRecord(raw)) throw new Error("Invalid registry item: expected object");

  const schemaVersion = raw.schemaVersion;
  if (schemaVersion !== 1) {
    throw new Error("Invalid registry item: unsupported schemaVersion");
  }

  const kind = raw.kind;
  if (kind !== "tool" && kind !== "agent" && kind !== "command" && kind !== "themes") {
    throw new Error("Invalid registry item: unsupported kind");
  }

  const name = raw.name;
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("Invalid registry item: name must be a non-empty string");
  }

  const description =
    raw.description === undefined
      ? undefined
      : typeof raw.description === "string"
        ? raw.description
        : (() => {
            throw new Error("Invalid registry item: description must be string");
          })();

  const filesRaw = raw.files;
  if (!Array.isArray(filesRaw)) {
    throw new Error("Invalid registry item: files must be an array");
  }

  const files = filesRaw.map((f) => {
    if (!isRecord(f)) throw new Error("Invalid registry item: file must be object");
    const filePath = f.path;
    const content = f.content;

    if (typeof filePath !== "string" || filePath.length === 0) {
      throw new Error("Invalid registry item: file.path must be string");
    }

    if (typeof content !== "string") {
      throw new Error("Invalid registry item: file.content must be string");
    }

    const modeRaw = f.mode;
    let mode: "0644" | "0755" | undefined;

    if (modeRaw === undefined) {
      mode = undefined;
    } else if (modeRaw === "0644" || modeRaw === "0755") {
      mode = modeRaw;
    } else {
      throw new Error("Invalid registry item: file.mode must be 0644|0755");
    }

    return mode
      ? { path: filePath, content, mode }
      : { path: filePath, content };
  });

  const entryRaw = raw.entry;
  const entry =
    entryRaw === undefined
      ? undefined
      : typeof entryRaw === "string"
        ? entryRaw
        : (() => {
            throw new Error("Invalid registry item: entry must be string");
          })();

  const postinstallRaw = raw.postinstall;
  const postinstall =
    postinstallRaw === undefined
      ? undefined
      : (() => {
          if (!isRecord(postinstallRaw)) {
            throw new Error("Invalid registry item: postinstall must be object");
          }
          const commandsRaw = postinstallRaw.commands;
          if (!Array.isArray(commandsRaw) || commandsRaw.some((c) => typeof c !== "string")) {
            throw new Error("Invalid registry item: postinstall.commands must be string[]");
          }
          const cwdRaw = postinstallRaw.cwd;
          if (cwdRaw !== undefined && typeof cwdRaw !== "string") {
            throw new Error("Invalid registry item: postinstall.cwd must be string");
          }
          return { commands: commandsRaw, cwd: cwdRaw };
        })();

  return {
    schemaVersion: 1,
    kind,
    name,
    description,
    registryDependencies: asStringArray(raw.registryDependencies, "registryDependencies"),
    files,
    entry,
    postinstall,
  };
}

function isProbablyUrl(spec: string): boolean {
  return spec.startsWith("http://") || spec.startsWith("https://");
}

function looksLikeFilePath(spec: string): boolean {
  return spec.startsWith("/") || spec.startsWith("./") || spec.startsWith("../") || spec.endsWith(".json");
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch registry item: ${url} (${res.status})`);
  }
  return await res.json();
}

export type FetchRegistryItemResult = {
  item: RegistryItem;
  source: string;
};

export async function fetchRegistryItem(
  spec: string,
  opts: { cwd: string },
): Promise<FetchRegistryItemResult> {
  const trimmed = spec.trim();

  if (trimmed.length === 0) {
    throw new Error("Missing registry item spec");
  }

  const embedded = await getEmbeddedRegistryItem(trimmed);
  if (embedded) {
    return { item: embedded, source: `embedded:${embedded.kind}/${embedded.name}` };
  }

  if (isProbablyUrl(trimmed)) {
    const raw = await fetchJson(trimmed);
    return { item: parseRegistryItemV1(raw), source: trimmed };
  }

  if (looksLikeFilePath(trimmed)) {
    const resolved = path.isAbsolute(trimmed)
      ? trimmed
      : path.resolve(opts.cwd, trimmed);
    const rawText = await readFile(resolved, "utf8");
    return { item: parseRegistryItemV1(JSON.parse(rawText)), source: resolved };
  }

  throw new Error(
    `Unknown registry spec: ${trimmed} (try embedded item, URL, or path to .json)`,
  );
}
