/**
 * Claude Code agent frontmatter helpers (F01 / NEXT-03).
 * Pure string parsing — no filesystem I/O.
 *
 * Claude Code requires YAML frontmatter with `name` and `description`.
 * Internal role IDs (A01–A30) map 1:1 to registered agent names.
 */

import {
  AGENT_ROLE_IDS,
  getAgentRoleContract,
  isAgentRoleId,
  type AgentRoleId,
} from "./agent-roles.js";

export type AgentFrontmatter = {
  name: string;
  description: string;
};

export type ParsedAgentMarkdown = {
  frontmatter: AgentFrontmatter;
  body: string;
};

/**
 * Registered Claude Code `--agent` name for an internal role ID.
 * Identity-stable: A01 registers as "A01" (filename A01.md may differ in future).
 */
export function registeredAgentName(roleId: AgentRoleId): string {
  return roleId;
}

/** Inverse: registered name → internal role ID when the mapping is identity-stable. */
export function roleIdFromRegisteredAgentName(
  name: string,
): AgentRoleId | null {
  if (!isAgentRoleId(name)) {
    return null;
  }
  return name;
}

export function agentFrontmatterDescription(roleId: AgentRoleId): string {
  const contract = getAgentRoleContract(roleId);
  return `WorkSocial role ${roleId} (${contract.name}). ${contract.mission}`;
}

/**
 * Minimal YAML frontmatter parser for required `name` + `description` fields.
 * Does not depend on a YAML library — only the fields Claude Code requires.
 */
export function parseAgentMarkdown(markdown: string):
  | { ok: true; parsed: ParsedAgentMarkdown }
  | { ok: false; reason: string } {
  const trimmed = markdown.replace(/^\uFEFF/, "");
  if (!trimmed.startsWith("---")) {
    return { ok: false, reason: "Missing opening YAML frontmatter delimiter" };
  }
  const afterOpen = trimmed.slice(3);
  const closeIdx = afterOpen.search(/\n---\s*(?:\n|$)/);
  if (closeIdx < 0) {
    return { ok: false, reason: "Missing closing YAML frontmatter delimiter" };
  }
  const yamlBlock = afterOpen.slice(0, closeIdx).replace(/^\n/, "");
  const body = afterOpen.slice(closeIdx).replace(/^\n---\s*/, "").replace(/^\n/, "");

  const fields: Record<string, string> = {};
  for (const rawLine of yamlBlock.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }
    const match = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!match) {
      return {
        ok: false,
        reason: `Unsupported frontmatter line (expected key: value): ${line}`,
      };
    }
    const key = match[1]!;
    let value = match[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }

  const name = fields.name?.trim() ?? "";
  const description = fields.description?.trim() ?? "";
  if (!name) {
    return { ok: false, reason: "Frontmatter missing required field: name" };
  }
  if (!description) {
    return {
      ok: false,
      reason: "Frontmatter missing required field: description",
    };
  }
  if (name.includes(":")) {
    return {
      ok: false,
      reason: "Agent name must not contain ':' (reserved for plugin scope)",
    };
  }
  if (name.length > 256) {
    return { ok: false, reason: "Agent name exceeds 256 characters" };
  }

  return {
    ok: true,
    parsed: {
      frontmatter: { name, description },
      body,
    },
  };
}

export function validateAgentMarkdownForRole(
  roleId: AgentRoleId,
  markdown: string,
): { ok: true; registeredName: string } | { ok: false; reason: string } {
  const parsed = parseAgentMarkdown(markdown);
  if (!parsed.ok) {
    return parsed;
  }
  const expected = registeredAgentName(roleId);
  if (parsed.parsed.frontmatter.name !== expected) {
    return {
      ok: false,
      reason: `Registered name '${parsed.parsed.frontmatter.name}' does not match internal ID mapping for ${roleId} (expected '${expected}')`,
    };
  }
  return { ok: true, registeredName: expected };
}

export type AgentDocsValidationResult = {
  ok: boolean;
  checked: number;
  failures: Array<{ roleId: AgentRoleId; reason: string }>;
};

/**
 * Validate all thirty role markdown bodies have valid frontmatter and ID mapping.
 * Caller supplies the markdown text for each role (filesystem I/O stays outside domain).
 */
export function validateAllAgentRoleMarkdown(
  docs: ReadonlyMap<AgentRoleId, string> | Readonly<Record<string, string>>,
): AgentDocsValidationResult {
  const failures: Array<{ roleId: AgentRoleId; reason: string }> = [];
  const get = (roleId: AgentRoleId): string | undefined => {
    if (docs instanceof Map) {
      return docs.get(roleId);
    }
    return (docs as Readonly<Record<string, string>>)[roleId];
  };

  for (const roleId of AGENT_ROLE_IDS) {
    const md = get(roleId);
    if (md === undefined) {
      failures.push({ roleId, reason: "Missing agent markdown" });
      continue;
    }
    const result = validateAgentMarkdownForRole(roleId, md);
    if (!result.ok) {
      failures.push({ roleId, reason: result.reason });
    }
  }

  return {
    ok: failures.length === 0,
    checked: AGENT_ROLE_IDS.length,
    failures,
  };
}

/** Render Claude Code agent markdown with required frontmatter. */
export function renderAgentRoleMarkdown(roleId: AgentRoleId): string {
  const role = getAgentRoleContract(roleId);
  const name = registeredAgentName(roleId);
  const description = agentFrontmatterDescription(roleId);

  return `---
name: ${name}
description: ${JSON.stringify(description)}
---

# ${role.roleId} — ${role.name}

Status: role contract registered for R1-04. Not production-activated.
Execution: bounded Claude Code worker via \`services/claude-runner\` — live vs fixture mode is explicit (never silent fixture success when live is required).
Authority: reasoning proposes; action gateway + grants authorize effects. No blanket permission bypass.

## Contract

| Field | Value |
|-------|-------|
| Role ID | ${role.roleId} |
| Registered agent name | ${name} |
| Version | ${role.version} |
| Group | ${role.group} |
| Evaluation suite | ${role.evaluationSuiteId} |
| Independent reviewer | ${role.independentReviewerRoleId} |
| May issue review verdicts | ${role.mayIssueReviewVerdicts ? "yes" : "no"} |
| Escalation owner | ${role.escalationOwner} |

## Mission

${role.mission}

## Subscribed events

${role.subscribedEvents.map((e) => `- \`${e}\``).join("\n")}

## Asset scope

${role.assetScope.map((e) => `- \`${e}\``).join("\n")}

## Inputs / outputs

**Inputs:** ${role.inputKinds.map((x) => `\`${x}\``).join(", ")}

**Outputs:** ${role.outputKinds.map((x) => `\`${x}\``).join(", ")}

## Approved tools

${role.approvedTools.map((e) => `- \`${e}\``).join("\n")}

## Forbidden effects

${role.forbiddenEffects.map((e) => `- \`${e}\``).join("\n")}

## Resource limits

- maxDeadlineSeconds: ${role.resourceLimits.maxDeadlineSeconds}
- maxAttempts: ${role.resourceLimits.maxAttempts}
- maxOutputBytes: ${role.resourceLimits.maxOutputBytes}
- maxBudgetMinor: ${role.resourceLimits.maxBudgetMinor}
- maxDelegationFanout: ${role.resourceLimits.maxDelegationFanout}

## Policy checks

${role.policyChecks.map((e) => `- \`${e}\``).join("\n")}

## Artifact destinations

${role.artifactDestinations.map((e) => `- \`${e}\``).join("\n")}

## Failure modes

${role.failureModes.map((e) => `- \`${e}\``).join("\n")}

## Notes

- Model self-confidence is never authorization.
- Recursive free-form delegation is disabled; only typed task requests through the scheduler.
- Author cannot self-approve; proposals requiring release go through ${role.independentReviewerRoleId} and the action gateway.
- Live CLI failures must not be reported as fixture SUCCESS.
`;
}
