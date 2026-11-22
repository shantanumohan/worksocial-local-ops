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

/**
 * Conservative allow-list for pinned CLI invocations.
 * `--tools` restricts available tools; empty string = no built-in tools.
 */
export const ALLOWED_CLI_FLAGS = [
  "--print",
  "--output-format",
  "--model",
  "--max-turns",
  "--agent",
  "--tools",
  "--setting-sources",
] as const;

/** Default live tools: none — reasoning proposes; gateway authorizes effects. */
export const DEFAULT_LIVE_CLI_TOOLS = "" as const;

export type ClaudeCliDetection = {
  available: boolean;
  executablePath: string | null;
  version: string | null;
  reason: string;
};

export type ClaudeCliInvokeRequest = {
  executablePath: string;
  /**
   * Registered Claude Code agent name (e.g. A01), discovered from
   * `.claude/agents` under `cwd` — never a filesystem path.
   */
  agentName: string;
  /** Working directory that contains `.claude/agents` for agent discovery. */
  cwd: string;
  modelId: string;
  /** Prompt content passed via stdin — never interpolated into the shell. */
  prompt: string;
  timeoutMs: number;
  maxOutputBytes: number;
  /**
   * Comma-separated tool allow-list for `--tools`.
   * Empty string disables built-in tools (Bash/Edit/etc.).
   */
  tools?: string;
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
        | "NONZERO_EXIT"
        | "INVALID_AGENT";
      reason: string;
      stdout?: string;
      stderr?: string;
      durationMs?: number;
    };

/**
 * Pure stdout byte-bound check for T-X011 (output bomb).
 * Oversized output is refused and must not be delivered as usable stdout
 * (quarantined / discarded). Counts UTF-8 bytes, not characters.
 */
export type StdoutBoundAssessment =
  | { withinBound: true; byteLength: number }
  | {
      withinBound: false;
      code: "OUTPUT_TOO_LARGE";
      reason: string;
      byteLength: number;
    };

export function assessStdoutBound(
  stdoutUtf8: string,
  maxOutputBytes: number,
): StdoutBoundAssessment {
  const byteLength = Buffer.byteLength(stdoutUtf8, "utf8");
  if (byteLength > maxOutputBytes) {
    return {
      withinBound: false,
      code: "OUTPUT_TOO_LARGE",
      reason: `stdout exceeded ${maxOutputBytes} bytes`,
      byteLength,
    };
  }
  return { withinBound: true, byteLength };
}

/**
 * Quarantine decision for oversized CLI stdout — bomb content is not delivered.
 */
export function quarantineStdoutDelivery(
  assessment: StdoutBoundAssessment,
):
  | { deliver: true }
  | { deliver: false; code: "OUTPUT_TOO_LARGE"; reason: string } {
  if (assessment.withinBound) {
    return { deliver: true };
  }
  return {
    deliver: false,
    code: assessment.code,
    reason: assessment.reason,
  };
}

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
      if (
        lower === forbidden.toLowerCase() ||
        lower.startsWith(`${forbidden.toLowerCase()}=`)
      ) {
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

/** Registered agent names are A01–A30 only — never paths. */
export function isRegisteredAgentName(name: string): boolean {
  return /^A(0[1-9]|[12][0-9]|30)$/.test(name);
}

function tryExecutable(path: string): boolean {
  try {
    accessSync(path, fsConstants.X_OK);
    return true;
  } catch {
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

function readCliVersion(
  executablePath: string,
  timeoutMs: number,
): Promise<string | null> {
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
 * Tools default to empty (no Bash/Edit) unless explicitly overridden.
 */
export function invokeClaudeCli(
  request: ClaudeCliInvokeRequest,
): Promise<ClaudeCliInvokeResult> {
  if (!isRegisteredAgentName(request.agentName)) {
    return Promise.resolve({
      ok: false,
      code: "INVALID_AGENT",
      reason: `Agent name must be a registered role A01–A30, got '${request.agentName}'`,
    });
  }

  const tools = request.tools ?? DEFAULT_LIVE_CLI_TOOLS;
  // Refuse any tools string that would re-enable shell/edit by default.
  if (/\b(Bash|Edit|Write|MultiEdit|NotebookEdit)\b/i.test(tools)) {
    return Promise.resolve({
      ok: false,
      code: "FLAG_DENIED",
      reason: "Bash/Edit/Write tools are not permitted on the live CLI path",
    });
  }

  const args = [
    "--print",
    "--output-format",
    "json",
    "--model",
    request.modelId,
    "--max-turns",
    "4",
    "--agent",
    request.agentName,
    "--tools",
    tools,
    // Do not load user/project settings that may widen tool permissions.
    "--setting-sources",
    "",
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
        cwd: request.cwd,
        env: {
          ...process.env,
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
      const bound = assessStdoutBound(stdout, request.maxOutputBytes);
      if (!bound.withinBound) {
        child.kill("SIGKILL");
        clearTimeout(timer);
        // Quarantine: do not deliver bomb stdout to callers.
        finish({
          ok: false,
          code: bound.code,
          reason: bound.reason,
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
