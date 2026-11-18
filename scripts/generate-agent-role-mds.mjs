/**
 * Regenerates .claude/agents/A01–A30.md from the compiled domain registry.
 * Run after `pnpm --filter @worksocial/domain build`.
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { listAgentRoleContracts } from "../packages/domain/dist/agent-roles.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".claude", "agents");

for (const role of listAgentRoleContracts()) {
  const md = `# ${role.roleId} — ${role.name}

Status: role contract registered for R1-04. Not production-activated.
Execution: bounded Claude Code worker via \`services/claude-runner\` (fixture mode when CLI absent).
Authority: reasoning proposes; action gateway + grants authorize effects. No blanket permission bypass.

## Contract

| Field | Value |
|-------|-------|
| Role ID | ${role.roleId} |
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
`;
  writeFileSync(join(outDir, `${role.roleId}.md`), md, "utf8");
}

console.log(`Wrote ${listAgentRoleContracts().length} role contracts to ${outDir}`);
