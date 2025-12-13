import path from "node:path";
import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import type {
  ApplyInstallResult,
  ConfigRoot,
  InstallPlan,
  OcxItemKind,
} from "./types";
import type { ResolvedRegistryItem } from "./resolve";
import {
  getTopLevelJsoncPropertyValueText,
  upsertTopLevelJsoncProperty,
} from "./jsonc";

type InstalledOcxItem = {
  source: string;
  dir: string;
  entry: string;
  postinstall?: {
    commands: string[];
    cwd: string;
  };
};

type OcxManagedConfig = {
  items: Record<OcxItemKind, Record<string, InstalledOcxItem>>;
};

function emptyOcxManagedConfig(): OcxManagedConfig {
  return {
    items: {
      tool: {},
      agent: {},
      command: {},
      themes: {},
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function ensureRecordMap(value: unknown): Record<string, InstalledOcxItem> {
  if (!isRecord(value)) return {};
  return value as Record<string, InstalledOcxItem>;
}

function parseExistingOcxManagedConfig(configText: string): OcxManagedConfig {
  const valueText = getTopLevelJsoncPropertyValueText(configText, "ocx");
  if (!valueText) return emptyOcxManagedConfig();

  try {
    const parsed: unknown = JSON.parse(valueText);
    if (!isRecord(parsed)) return emptyOcxManagedConfig();

    const itemsRaw = parsed.items;
    const itemsRecord = isRecord(itemsRaw) ? itemsRaw : {};

    return {
      items: {
        tool: ensureRecordMap(itemsRecord.tool),
        agent: ensureRecordMap(itemsRecord.agent),
        command: ensureRecordMap(itemsRecord.command),
        themes: ensureRecordMap(itemsRecord.themes),
      },
    };
  } catch {
    return emptyOcxManagedConfig();
  }
}

function normalizeRegistryRelativePath(p: string): string {
  const normalized = path.posix.normalize(p).replace(/^\.\//, "");

  if (path.posix.isAbsolute(normalized)) {
    throw new Error(`Registry file path must be relative: ${p}`);
  }

  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Registry file path cannot escape target dir: ${p}`);
  }

  if (normalized.length === 0) {
    throw new Error("Registry file path cannot be empty");
  }

  return normalized;
}

function computeDirRel(configRoot: ConfigRoot, kind: OcxItemKind, name: string): string {
  const parts = configRoot.kind === "project"
    ? [".opencode", kind, name]
    : [kind, name];

  return parts.join("/");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export function planInstalls(
  resolved: ResolvedRegistryItem[],
  configRoot: ConfigRoot,
): InstallPlan[] {
  return resolved.map(({ item, source }) => {
    const kindDir = path.join(configRoot.opencodeDir, item.kind);
    const targetDir = path.join(kindDir, item.name);

    const dirRel = computeDirRel(configRoot, item.kind, item.name);
    const entryFile = normalizeRegistryRelativePath(item.entry ?? "index.ts");
    const entryRel = `${dirRel}/${entryFile}`;

    const mkdirSet = new Set<string>([configRoot.opencodeDir, kindDir, targetDir]);
    const writes = item.files.map((file) => {
      const rel = normalizeRegistryRelativePath(file.path);
      const dest = path.join(targetDir, ...rel.split("/"));
      mkdirSet.add(path.dirname(dest));
      return { path: dest, content: file.content, mode: file.mode };
    });

    const postinstall = item.postinstall
      ? {
          commands: item.postinstall.commands,
          cwd: path.resolve(
            configRoot.rootDir,
            item.postinstall.cwd ?? ".",
          ),
        }
      : null;

    return {
      configRoot,
      item: {
        kind: item.kind,
        name: item.name,
        source,
        targetDir,
        entryRel,
      },
      mkdirs: Array.from(mkdirSet),
      writes,
      configEdits: [
        {
          jsonPath: ["ocx", "items", item.kind, item.name],
          value: {
            source,
            dir: dirRel,
            entry: entryRel,
            ...(postinstall ? { postinstall } : {}),
          },
        },
      ],
      postinstall,
      dependencies: {
        // TODO: decide bun add defaults
      },
    };
  });
}

async function ensureDirs(dirs: string[]): Promise<void> {
  for (const d of dirs) {
    await mkdir(d, { recursive: true });
  }
}

async function writeFileAtomic(destPath: string, content: string): Promise<void> {
  const dir = path.dirname(destPath);
  await mkdir(dir, { recursive: true });

  const tmpBase = path.join(dir, `.tmp-ocx-${Date.now()}-`);
  const tmpPath = await mkdtemp(tmpBase);
  const tmpFile = path.join(tmpPath, "file");

  await Bun.write(tmpFile, content);
  await rename(tmpFile, destPath);
  await rm(tmpPath, { recursive: true, force: true });
}

async function stageDirectory(
  plan: InstallPlan,
  overwrite: boolean,
): Promise<string> {
  const kindDir = path.dirname(plan.item.targetDir);
  await mkdir(kindDir, { recursive: true });

  const tmpDir = await mkdtemp(path.join(kindDir, `.tmp-ocx-${plan.item.name}-`));

  try {
    for (const w of plan.writes) {
      const rel = path.relative(plan.item.targetDir, w.path);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`Refusing to write outside target dir: ${w.path}`);
      }

      const destInTmp = path.join(tmpDir, rel);
      await mkdir(path.dirname(destInTmp), { recursive: true });
      await Bun.write(destInTmp, w.content);

      if (w.mode) {
        // Bun doesn't expose chmod directly; use shelling via fs if needed later.
        // For now, keep modes as metadata only.
      }
    }

    const targetExists = await pathExists(plan.item.targetDir);
    if (targetExists) {
      if (!overwrite) {
        throw new Error(
          `Target already exists: ${plan.item.targetDir} (use --overwrite)`,
        );
      }
      await rm(plan.item.targetDir, { recursive: true, force: true });
    }

    await rename(tmpDir, plan.item.targetDir);
    return plan.item.targetDir;
  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

async function updateOpencodeConfig(
  configPath: string,
  plans: InstallPlan[],
): Promise<void> {
  const existingText = await Bun.file(configPath).text().catch(() => "{}");

  const existing = parseExistingOcxManagedConfig(existingText);

  for (const plan of plans) {
    const kind = plan.item.kind;
    const name = plan.item.name;

    const dirRel = plan.item.entryRel.split("/").slice(0, -1).join("/");

    const entry = plan.item.entryRel;

    const nextItem: InstalledOcxItem = {
      source: plan.item.source,
      dir: dirRel,
      entry,
      ...(plan.postinstall ? { postinstall: plan.postinstall } : {}),
    };

    existing.items[kind][name] = nextItem;
  }

  const updatedText = upsertTopLevelJsoncProperty(existingText, "ocx", existing);
  await writeFileAtomic(configPath, updatedText);
}

async function runPostinstall(plan: InstallPlan): Promise<void> {
  if (!plan.postinstall) return;

  for (const command of plan.postinstall.commands) {
    const child = Bun.spawn({
      cmd: ["bash", "-lc", command],
      cwd: plan.postinstall.cwd,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
      env: {
        ...process.env,
      },
    });

    const exitCode = await child.exited;
    if (exitCode !== 0) {
      throw new Error(
        `Postinstall command failed (${exitCode}): ${command}`,
      );
    }
  }
}

export async function applyInstallPlans(
  plans: InstallPlan[],
  opts: {
    overwrite: boolean;
    allowPostinstall: boolean;
  },
): Promise<ApplyInstallResult> {
  if (plans.length === 0) {
    throw new Error("No install plans to apply");
  }

  const configRoot = plans[0]?.configRoot;
  if (!configRoot) throw new Error("Missing config root");

  await ensureDirs([configRoot.opencodeDir]);

  const wroteFiles: string[] = [];

  for (const plan of plans) {
    const installedDir = await stageDirectory(plan, opts.overwrite);
    wroteFiles.push(installedDir);
  }

  await ensureDirs([path.dirname(configRoot.configPath)]);
  await updateOpencodeConfig(configRoot.configPath, plans);

  let ranPostinstall = false;
  if (opts.allowPostinstall) {
    for (const plan of plans) {
      if (!plan.postinstall) continue;
      ranPostinstall = true;
      await runPostinstall(plan);
    }
  }

  return {
    wroteFiles,
    editedConfigPath: configRoot.configPath,
    ranPostinstall,
  };
}

export function defaultHomeDir(): string {
  return os.homedir();
}
