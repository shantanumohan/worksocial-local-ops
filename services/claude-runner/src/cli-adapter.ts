/**
 * Pinned Claude Code CLI adapter (R1-04).
 * Spawns a fixed executable with validated args — no shell interpolation,
 * no blanket permission bypass (--dangerously-skip-permissions etc.).
 */

import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import { classifyClaudeCliCompletion } from "@worksocial/domain";

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
        | "CLI_REPORTED_ERROR"
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
/**
 * Stop a worker process tree by process group when possible.
 * Prefers killing the negative PID (group leader from detached spawn);
 * falls back to the direct PID.
 */
export function stopProcessTree(
  pid: number,
  signal: NodeJS.Signals = "SIGKILL",
): void {
  try {
    process.kill(-pid, signal);
    return;
  } catch {
    // Not a group leader / ESRCH — fall through.
  }
  try {
    process.kill(pid, signal);
  } catch {
    // Already gone.
  }
}

export type StdoutBoundAssessment =
  | {
      withinBound: true;
      byteLength: number;
      liveProviderSuccessClaimed: false;
      externalEffects: "NONE";
    }
  | {
      withinBound: false;
      code: "OUTPUT_TOO_LARGE";
      reason: string;
      byteLength: number;
      liveProviderSuccessClaimed: false;
      externalEffects: "NONE";
    };

const OUTPUT_BOMB_HONESTY = {
  liveProviderSuccessClaimed: false as const,
  externalEffects: "NONE" as const,
};

/**
 * Byte-length stdout bound (T-X011). Counts UTF-8 bytes, not characters.
 * Never invents live VERIFIED; ACCEPTED≠VERIFIED for fixture soak.
 */
export function assessStdoutBound(
  stdoutUtf8: string,
  maxOutputBytes: number,
): StdoutBoundAssessment {
  const byteLength = Buffer.byteLength(stdoutUtf8, "utf8");
  if (!(maxOutputBytes > 0)) {
    return {
      withinBound: false,
      code: "OUTPUT_TOO_LARGE",
      reason: "maxOutputBytes must be a positive bound (T-X011); ACCEPTED≠VERIFIED",
      byteLength,
      ...OUTPUT_BOMB_HONESTY,
    };
  }
  if (byteLength > maxOutputBytes) {
    return {
      withinBound: false,
      code: "OUTPUT_TOO_LARGE",
      reason: `stdout exceeded ${maxOutputBytes} bytes (T-X011); ACCEPTED≠VERIFIED`,
      byteLength,
      ...OUTPUT_BOMB_HONESTY,
    };
  }
  return { withinBound: true, byteLength, ...OUTPUT_BOMB_HONESTY };
}

export type StdoutQuarantineDecision =
  | {
      deliver: true;
      liveProviderSuccessClaimed: false;
      externalEffects: "NONE";
    }
  | {
      deliver: false;
      code: "OUTPUT_TOO_LARGE" | "LIVE_CLAIM_REFUSED";
      reason: string;
      liveProviderSuccessClaimed: false;
      externalEffects: "NONE";
      /** Bomb body never included — quarantine has no payload. */
      quarantinedStdout: null;
    };

/**
 * Quarantine decision for oversized CLI stdout — bomb content is not delivered.
 * Live VERIFIED / force-deliver claims refused (T-X011 hillclimb).
 */
export function quarantineStdoutDelivery(
  assessment: StdoutBoundAssessment,
  opts?: {
    claimLiveVerified?: boolean;
    forceDeliverDespiteBomb?: boolean;
  },
): StdoutQuarantineDecision {
  if (opts?.claimLiveVerified === true || opts?.forceDeliverDespiteBomb === true) {
    return {
      deliver: false,
      code: "LIVE_CLAIM_REFUSED",
      reason:
        "Live VERIFIED / force-deliver of bomb stdout refused — fixture ACCEPTED≠VERIFIED; externalEffects=NONE",
      quarantinedStdout: null,
      ...OUTPUT_BOMB_HONESTY,
    };
  }
  if (assessment.withinBound) {
    return { deliver: true, ...OUTPUT_BOMB_HONESTY };
  }
  return {
    deliver: false,
    code: assessment.code,
    reason: assessment.reason,
    quarantinedStdout: null,
    ...OUTPUT_BOMB_HONESTY,
  };
}

/**
 * Fail-closed honesty check for T-X011 bound/quarantine decisions.
 */
export function assertOutputBombBoundedHonest(input: {
  assessment: StdoutBoundAssessment;
  quarantine: StdoutQuarantineDecision;
}): {
  ok: boolean;
  code: "OUTPUT_BOMB_HONEST" | "OUTPUT_BOMB_DISHONEST";
  reasons: string[];
  externalEffects: "NONE";
} {
  const reasons: string[] = [];
  const { assessment, quarantine } = input;
  if (assessment.liveProviderSuccessClaimed !== false) {
    reasons.push("assessment.liveProviderSuccessClaimed must be false");
  }
  if (assessment.externalEffects !== "NONE") {
    reasons.push("assessment.externalEffects must be NONE");
  }
  if (quarantine.liveProviderSuccessClaimed !== false) {
    reasons.push("quarantine.liveProviderSuccessClaimed must be false");
  }
  if (quarantine.externalEffects !== "NONE") {
    reasons.push("quarantine.externalEffects must be NONE");
  }
  if (!assessment.withinBound && quarantine.deliver === true) {
    reasons.push("Oversized stdout must not be delivered");
  }
  if (!assessment.withinBound && quarantine.deliver === false) {
    if (quarantine.quarantinedStdout !== null) {
      reasons.push("Quarantine must not retain bomb stdout payload");
    }
  }
  if (quarantine.deliver === true && !assessment.withinBound) {
    reasons.push("Cannot deliver when assessment is over bound");
  }
  if (reasons.length > 0) {
    return {
      ok: false,
      code: "OUTPUT_BOMB_DISHONEST",
      reasons,
      externalEffects: "NONE",
    };
  }
  return {
    ok: true,
    code: "OUTPUT_BOMB_HONEST",
    reasons: [
      "liveProviderSuccessClaimed=false externalEffects=NONE ACCEPTED≠VERIFIED; bomb not delivered",
    ],
    externalEffects: "NONE",
  };
}

/**
 * Pure spawn plan for Claude CLI (T-X010).
 * Prompt is never placed on argv — delivery is stdin only; shell is always false.
 */
export type ClaudeCliInvocationPlan =
  | {
      ok: true;
      argv: readonly string[];
      shell: false;
      promptDelivery: "stdin";
      /** Prompt kept separate from argv — never shell-interpolated. */
      prompt: string;
      agentName: string;
      modelId: string;
    }
  | {
      ok: false;
      code: "FLAG_DENIED" | "INVALID_AGENT";
      reason: string;
    };

export type PlanClaudeCliInvocationInput = {
  agentName: string;
  modelId: string;
  prompt: string;
  tools?: string;
  extraArgs?: readonly string[];
};

/**
 * Build a fixed-argv CLI plan. Malicious prompt content cannot become shell
 * injection because it is never joined into a shell string or argv.
 */
export function planClaudeCliInvocation(
  input: PlanClaudeCliInvocationInput,
): ClaudeCliInvocationPlan {
  if (!isRegisteredAgentName(input.agentName)) {
    return {
      ok: false,
      code: "INVALID_AGENT",
      reason: `Agent name must be a registered role A01–A30, got '${input.agentName}'`,
    };
  }

  const tools = input.tools ?? DEFAULT_LIVE_CLI_TOOLS;
  if (/\b(Bash|Edit|Write|MultiEdit|NotebookEdit)\b/i.test(tools)) {
    return {
      ok: false,
      code: "FLAG_DENIED",
      reason: "Bash/Edit/Write tools are not permitted on the live CLI path",
    };
  }

  const argv = [
    "--print",
    "--output-format",
    "json",
    "--model",
    input.modelId,
    "--max-turns",
    "4",
    "--agent",
    input.agentName,
    "--tools",
    tools,
    "--setting-sources",
    "",
    ...(input.extraArgs ?? []),
  ];

  const flagCheck = validateCliArgs(argv);
  if (!flagCheck.ok) {
    return {
      ok: false,
      code: "FLAG_DENIED",
      reason: flagCheck.reason ?? "Flag denied",
    };
  }

  const joined = argv.join(" ").toLowerCase();
  if (
    joined.includes("dangerously-skip-permissions") ||
    joined.includes("permission-mode=bypass")
  ) {
    return {
      ok: false,
      code: "FLAG_DENIED",
      reason: "Permission bypass flags are never allowed",
    };
  }

  return {
    ok: true,
    argv,
    shell: false,
    promptDelivery: "stdin",
    prompt: input.prompt,
    agentName: input.agentName,
    modelId: input.modelId,
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
  const plan = planClaudeCliInvocation({
    agentName: request.agentName,
    modelId: request.modelId,
    prompt: request.prompt,
    ...(request.tools !== undefined ? { tools: request.tools } : {}),
    ...(request.extraArgs !== undefined
      ? { extraArgs: request.extraArgs }
      : {}),
  });
  if (!plan.ok) {
    return Promise.resolve({
      ok: false,
      code: plan.code,
      reason: plan.reason,
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
      child = spawn(request.executablePath, [...plan.argv], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: plan.shell,
        detached: true,
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

    const killTree = () => {
      if (typeof child.pid === "number") {
        stopProcessTree(child.pid, "SIGKILL");
      } else {
        child.kill("SIGKILL");
      }
    };

    const timer = setTimeout(() => {
      killTree();
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
        killTree();
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
      const classified = classifyClaudeCliCompletion({
        exitCode: code,
        stdout,
        stderr,
      });
      if (!classified.ok) {
        finish({
          ok: false,
          code: classified.code,
          reason: classified.reason,
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

    // Prompt via stdin only — never interpolated into argv/shell.
    child.stdin.write(plan.prompt);
    child.stdin.end();
  });
}
