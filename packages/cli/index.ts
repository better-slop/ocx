import {
  applyInstallPlans,
  listEmbeddedItems,
  planInstalls,
  resolveConfigRoot,
  resolveRegistryTree,
} from "@better-slop/core/registry";

type CliFlags = {
  cwd: string;
  overwrite: boolean;
  allowPostinstall: boolean;
};

function printHelp(): void {
  console.log(`ocx

Usage:
  ocx add <spec...> [--cwd <dir>] [--overwrite] [--allow-postinstall]
  ocx list

Notes:
  - Specs can be embedded item names (e.g. "hello"), URLs, or paths to .json manifests.
  - Default install is project-local via nearest .opencode/opencode.jsonc.
  - Postinstall hooks are skipped unless --allow-postinstall is set.
  - // TODO: windows support
  - // TODO: decide bun add defaults
`);
}

function parseArgs(argv: string[]): {
  command: string | null;
  specs: string[];
  flags: CliFlags;
} {
  const flags: CliFlags = {
    cwd: process.cwd(),
    overwrite: false,
    allowPostinstall: false,
  };

  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? "";

    if (token === "--help" || token === "-h") {
      return { command: "help", specs: [], flags };
    }

    if (token === "--cwd") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--cwd requires a value");
      }
      flags.cwd = next;
      i += 1;
      continue;
    }

    if (token === "--overwrite") {
      flags.overwrite = true;
      continue;
    }

    if (token === "--allow-postinstall") {
      flags.allowPostinstall = true;
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`Unknown flag: ${token}`);
    }

    positionals.push(token);
  }

  const command = positionals[0] ?? null;
  const specs = command ? positionals.slice(1) : [];

  return { command, specs, flags };
}

type InstallPlan = ReturnType<typeof planInstalls>[number];

function printPostinstallPreview(plans: InstallPlan[]): void {
  const withHooks = plans.filter(
    (p) => p.postinstall && p.postinstall.commands.length > 0,
  );
  if (withHooks.length === 0) return;

  console.log("\nPostinstall hooks detected (skipped unless --allow-postinstall):");
  for (const p of withHooks) {
    console.log(`- ${p.item.kind}/${p.item.name}`);
    for (const cmd of p.postinstall?.commands ?? []) {
      console.log(`  - ${cmd}`);
    }
  }
}

async function runAdd(specs: string[], flags: CliFlags): Promise<void> {
  const configRoot = await resolveConfigRoot(flags.cwd);
  const resolved = await resolveRegistryTree(specs, { cwd: flags.cwd });
  const plans = planInstalls(resolved, configRoot);

  const fileCount = plans.reduce((sum, p) => sum + p.writes.length, 0);
  const hasHooks = plans.some(
    (p) => p.postinstall && p.postinstall.commands.length > 0,
  );

  console.log(`Config: ${configRoot.configPath}`);
  console.log(`Install root: ${configRoot.opencodeDir} (${configRoot.kind})`);
  console.log(
    `Files: ${fileCount}  Overwrite: ${flags.overwrite ? "yes" : "no"}  Postinstall: ${flags.allowPostinstall ? "run" : "skip"}`,
  );

  console.log("Items:");
  for (const p of plans) {
    console.log(`- ${p.item.kind}/${p.item.name} (${p.item.source})`);
  }

  printPostinstallPreview(plans);
  if (hasHooks && !flags.allowPostinstall) {
    console.log("\nRe-run with --allow-postinstall to execute hooks.");
  }

  const result = await applyInstallPlans(plans, {
    overwrite: flags.overwrite,
    allowPostinstall: flags.allowPostinstall,
  });

  console.log(`\nWrote ${result.wroteFiles.length} item(s).`);
  console.log(`Updated config: ${result.editedConfigPath}`);
  console.log(`Postinstall: ${result.ranPostinstall ? "ran" : "skipped"}`);
}

function runList(): void {
  console.log("Embedded items:");
  for (const name of listEmbeddedItems()) {
    console.log(`- ${name}`);
  }
}

async function main(): Promise<void> {
  const { command, specs, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === "help") {
    printHelp();
    return;
  }

  if (command === "list") {
    runList();
    return;
  }

  if (command === "add") {
    if (specs.length === 0) {
      throw new Error("ocx add requires at least one spec");
    }
    await runAdd(specs, flags);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  await main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exitCode = 1;
}