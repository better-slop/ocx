#!/usr/bin/env bun

import { $ } from "bun";

const SESSION_PREFIX = "oc-web";

function getSessionName(port: number): string {
  return `${SESSION_PREFIX}-${port}`;
}

async function sessionExists(sessionName: string): Promise<boolean> {
  const result =
    await $`tmux has-session -t ${sessionName} 2>/dev/null`.nothrow();
  return result.exitCode === 0;
}

async function start(port: number, model: string): Promise<void> {
  const sessionName = getSessionName(port);

  if (await sessionExists(sessionName)) {
    console.error(
      `Session ${sessionName} already exists. Stop it first or use a different port.`,
    );
    process.exit(1);
  }

  console.log(`Starting session ${sessionName}...`);

  // Create new detached tmux session with opencode web in first pane
  await $`tmux new-session -d -s ${sessionName} -n main "opencode web --port ${port} --model ${model}"`;

  // Split horizontally and run tailscale serve in second pane
  await $`tmux split-window -h -t ${sessionName} "sudo tailscale serve --https ${port} ${port}"`;

  // Select even-horizontal layout for cleaner view
  await $`tmux select-layout -t ${sessionName} even-horizontal`;

  console.log(`Session ${sessionName} started.`);
  console.log(`  OpenCode: http://localhost:${port}`);
  console.log(`  Tailscale: https://<your-tailnet>:${port}`);
  console.log(`  Attach: tmux attach -t ${sessionName}`);
}

async function stop(port: number): Promise<void> {
  const sessionName = getSessionName(port);

  if (!(await sessionExists(sessionName))) {
    console.error(`Session ${sessionName} does not exist.`);
    process.exit(1);
  }

  console.log(`Stopping session ${sessionName}...`);

  // Remove tailscale serve for this port
  await $`sudo tailscale serve --https=${port} off`.nothrow();

  // Kill the tmux session (this kills all processes in it)
  await $`tmux kill-session -t ${sessionName}`;

  console.log(`Session ${sessionName} stopped.`);
}

async function list(): Promise<void> {
  console.log("=== Active oc:web Sessions ===\n");

  // List tmux sessions matching our prefix
  const tmuxResult =
    await $`tmux list-sessions -F "#{session_name}" 2>/dev/null`
      .nothrow()
      .text();

  const sessions = tmuxResult
    .split("\n")
    .filter((s) => s.startsWith(SESSION_PREFIX));

  if (sessions.length === 0) {
    console.log("No active oc:web tmux sessions.\n");
  } else {
    console.log("Tmux Sessions:");
    for (const session of sessions) {
      const port = session.replace(`${SESSION_PREFIX}-`, "");
      console.log(`  - ${session} (port ${port})`);
      console.log(`    Attach: tmux attach -t ${session}`);
    }
    console.log();
  }

  // List tailscale serve status
  console.log("Tailscale Serve Status:");
  const tsResult = await $`tailscale serve status 2>/dev/null`.nothrow().text();
  if (tsResult.trim()) {
    console.log(tsResult);
  } else {
    console.log("  No active tailscale serve instances.\n");
  }
}

function printUsage(): void {
  console.log(`Usage: oc-web <command> [options]

Commands:
  start --port <port> --model <model>   Start opencode web with tailscale serve
  stop --port <port>                    Stop session on specified port
  list                                  List all active sessions

Examples:
  oc-web start --port 3000 --model anthropic/claude-opus-4-5
  oc-web stop --port 3000
  oc-web list`);
}

function parseArgs(args: string[]): { port?: number; model?: string } {
  const result: { port?: number; model?: string } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--port" && next) {
      result.port = parseInt(next, 10);
      i++;
    } else if (arg === "--model" && next) {
      result.model = next;
      i++;
    }
  }

  return result;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command) {
    printUsage();
    process.exit(1);
  }

  switch (command) {
    case "start": {
      const opts = parseArgs(rest);
      if (!opts.port || !opts.model) {
        console.error("start requires --port and --model");
        process.exit(1);
      }
      await start(opts.port, opts.model);
      break;
    }
    case "stop": {
      const { port } = parseArgs(rest);
      if (!port) {
        console.error("stop requires --port");
        process.exit(1);
      }
      await stop(port);
      break;
    }
    case "list": {
      await list();
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
