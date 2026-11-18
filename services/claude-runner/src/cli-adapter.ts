/**
 * Pinned Claude Code CLI adapter (R1-04).
 * Spawns a fixed executable with validated args — no shell interpolation,
 * no blanket permission bypass (--dangerously-skip-permissions etc.).
 */

import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";

/** Flags explicitly forbidden regardless of CLI version. */
export const FORBIDDEN_CLI_FLAGS = [
  "--dangerously-skip-permissions",
  "--dangerously-skip-permissions=true",
  "--allow-all",
  "--no-permissions",
  "--permission-mode=bypass",
  "--permission-mode=dontAsk",
] as const;

/** Conservative allow-list for pinned CLI invocations. */
export const ALLOWED_CLI_FLAGS = [
  "--print",
  "--output-format",
  "--model",
  "--max-turns",
  "--agent",
] as const;

export type ClaudeCliDetection = {
  available: boolean;
  executablePath: string | null;
  version: string | null;
  reason: string;
};

export type ClaudeCliInvokeRequest = {
  executablePath: string;
  /** Absolute path to role definition; passed as a discrete argv element. */
  agentDefinitionPath: string;
  modelId: string;
  /** Prompt content passed via stdin — never interpolated into the shell. */
  prompt: string;
  timeoutMs: number;
  maxOutputBytes: number;
  /** Extra flags — validated against allow/deny lists. */
  extraArgs?: readonly string[];
};

export type ClaudeCliInvokeResult =
  | {
      ok: true;
      exitCode: number;
      stdout: string;
      stderr: string;
      durationMs: number;
      version: string | null;
    }
  | {
      ok: false;
      code:
        | "CLI_MISSING"
        | "FLAG_DENIED"
        | "TIMEOUT"
        | "OUTPUT_TOO_LARGE"
        | "SPAWN_FAILED"
        | "NONZERO_EXIT";
      reason: string;
      stdout?: string;
      stderr?: string;
      durationMs?: number;
    };

export function defaultClaudeExecutableCandidates(): string[] {
  const fromEnv = process.env.WORKSOCIAL_CLAUDE_CLI?.trim();
  const candidates = [
    fromEnv,
    "claude",
    "/usr/local/bin/claude",
    `${process.env.HOME ?? ""}/.local/bin/claude`,
  ].filter((x): x is string => Boolean(x && x.length > 0));
  return [...new Set(candidates)];
}

export function validateCliArgs(args: readonly string[]): {
  ok: boolean;
  reason?: string;
} {
  for (const arg of args) {
    const lower = arg.toLowerCase();
    for (const forbidden of FORBIDDEN_CLI_FLAGS) {
      if (lower === forbidden.toLowerCase() || lower.startsWith(`${forbidden.toLowerCase()}=`)) {
        return {
          ok: false,
          reason: `Forbidden CLI flag refused: ${arg}`,
        };
      }
    }
    if (arg.startsWith("-")) {
      const flag = arg.split("=")[0] ?? arg;
      const allowed = (ALLOWED_CLI_FLAGS as readonly string[]).some(
        (a) => flag === a || flag.startsWith(`${a}=`),
      );
      if (!allowed) {
        return {
          ok: false,
          reason: `CLI flag not in pinned allow-list: ${arg}`,
        };
      }
    }
  }
  return { ok: true };
}

function tryExecutable(path: string): boolean {
  try {
    accessSync(path, fsConstants.X_OK);
    return true;
  } catch {
    // PATH binaries may not be absolute; still attempt later via spawn.
    if (!path.includes("/") && !path.includes("\\")) {
      return true;
    }
    return false;
  }
}

export async function detectClaudeCli(options?: {
  candidates?: readonly string[];
  forceFixture?: boolean;
}): Promise<ClaudeCliDetection> {
  if (options?.forceFixture || process.env.WORKSOCIAL_CLAUDE_FIXTURE === "1") {
    return {
      available: false,
      executablePath: null,
      version: null,
      reason: "Fixture mode forced (WORKSOCIAL_CLAUDE_FIXTURE=1)",
    };
  }

  const candidates = options?.candidates ?? defaultClaudeExecutableCandidates();
  for (const candidate of candidates) {
    if (!tryExecutable(candidate) && candidate.includes("/")) {
      continue;
    }
    try {
      const version = await readCliVersion(candidate, 3_000);
      if (version) {
        return {
          available: true,
          executablePath: candidate,
          version,
          reason: "Claude CLI detected",
        };
      }
    } catch {
      // try next
    }
  }

  return {
    available: false,
    executablePath: null,
    version: null,
    reason: "Claude CLI not found; use fixture/offline mode",
  };
}

function readCliVersion(executablePath: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(executablePath, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: process.env,
    });
    let stdout = "";
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(null);
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) {
        finish(stdout.trim().split("\n")[0] ?? null);
      } else {
        finish(null);
      }
    });
  });
}

/**
 * Invoke Claude Code non-interactively. Prompt is written to stdin.
 * Never enables unrestricted permission bypass.
 */
export function invokeClaudeCli(
  request: ClaudeCliInvokeRequest,
): Promise<ClaudeCliInvokeResult> {
  const args = [
    "--print",
    "--output-format",
    "json",
    "--model",
    request.modelId,
    "--max-turns",
    "4",
    "--agent",
    request.agentDefinitionPath,
    ...(request.extraArgs ?? []),
  ];

  const flagCheck = validateCliArgs(args);
  if (!flagCheck.ok) {
    return Promise.resolve({
      ok: false,
      code: "FLAG_DENIED",
      reason: flagCheck.reason ?? "Flag denied",
    });
  }

  // Double-check no bypass slipped in via extraArgs
  const joined = args.join(" ").toLowerCase();
  if (
    joined.includes("dangerously-skip-permissions") ||
    joined.includes("permission-mode=bypass")
  ) {
    return Promise.resolve({
      ok: false,
      code: "FLAG_DENIED",
      reason: "Permission bypass flags are never allowed",
    });
  }

  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: ClaudeCliInvokeResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      child = spawn(request.executablePath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: {
          ...process.env,
          // Never inject bypass env vars.
          CLAUDE_CODE_PERMISSION_BYPASS: undefined,
        },
      });
    } catch (err) {
      finish({
        ok: false,
        code: "SPAWN_FAILED",
        reason: err instanceof Error ? err.message : "spawn failed",
      });
      return;
    }

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        ok: false,
        code: "TIMEOUT",
        reason: `CLI exceeded timeout ${request.timeoutMs}ms`,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      });
    }, request.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout, "utf8") > request.maxOutputBytes) {
        child.kill("SIGKILL");
        clearTimeout(timer);
        finish({
          ok: false,
          code: "OUTPUT_TOO_LARGE",
          reason: `stdout exceeded ${request.maxOutputBytes} bytes`,
          durationMs: Date.now() - started,
        });
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      finish({
        ok: false,
        code: "SPAWN_FAILED",
        reason: err.message,
        durationMs: Date.now() - started,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      if (code !== 0) {
        finish({
          ok: false,
          code: "NONZERO_EXIT",
          reason: `CLI exited with code ${code}`,
          stdout,
          stderr,
          durationMs,
        });
        return;
      }
      finish({
        ok: true,
        exitCode: code ?? 0,
        stdout,
        stderr,
        durationMs,
        version: null,
      });
    });

    child.stdin.write(request.prompt);
    child.stdin.end();
  });
}
