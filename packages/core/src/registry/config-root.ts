import os from "node:os";
import path from "node:path";
import { stat } from "node:fs/promises";
import type { ConfigRoot } from "./types";

async function pathIsDirectory(dirPath: string): Promise<boolean> {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

function normalizeAbsolutePath(p: string): string {
  return path.resolve(p);
}

function isInsideDir(absoluteChildPath: string, absoluteParentDir: string): boolean {
  const child = normalizeAbsolutePath(absoluteChildPath);
  const parent = normalizeAbsolutePath(absoluteParentDir);

  // TODO: windows support (drive letters + case-insensitive filesystems)

  const parentWithSep = parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`;
  return child === parent || child.startsWith(parentWithSep);
}

async function findNearestProjectRoot(startCwd: string): Promise<string> {
  let current = normalizeAbsolutePath(startCwd);

  while (true) {
    const candidate = path.join(current, ".opencode");
    if (await pathIsDirectory(candidate)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return normalizeAbsolutePath(startCwd);
    }
    current = parent;
  }
}

export async function resolveConfigRoot(
  cwd: string,
  homedir = os.homedir(),
): Promise<ConfigRoot> {
  const absoluteCwd = normalizeAbsolutePath(cwd);

  const globalConfigDirs = [
    path.join(homedir, ".config", "opencode"),
    path.join(homedir, ".opencode"),
  ];

  for (const globalDir of globalConfigDirs) {
    if (isInsideDir(absoluteCwd, globalDir)) {
      return {
        kind: "global",
        rootDir: globalDir,
        opencodeDir: globalDir,
        configPath: path.join(globalDir, "opencode.jsonc"),
      };
    }
  }

  const projectRoot = await findNearestProjectRoot(absoluteCwd);
  const opencodeDir = path.join(projectRoot, ".opencode");

  return {
    kind: "project",
    rootDir: projectRoot,
    opencodeDir,
    configPath: path.join(opencodeDir, "opencode.jsonc"),
  };
}
