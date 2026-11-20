/**
 * Regenerates .claude/agents/A01–A30.md from the compiled domain registry.
 * Emits Claude Code YAML frontmatter (name + description) with ID ↔ registered name mapping.
 * Run after `pnpm --filter @worksocial/domain build`.
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { listAgentRoleContracts } from "../packages/domain/dist/agent-roles.js";
import {
  renderAgentRoleMarkdown,
  validateAllAgentRoleMarkdown,
} from "../packages/domain/dist/agent-frontmatter.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".claude", "agents");

const roles = listAgentRoleContracts();
const docs = new Map();

for (const role of roles) {
  const md = renderAgentRoleMarkdown(role.roleId);
  writeFileSync(join(outDir, `${role.roleId}.md`), md, "utf8");
  docs.set(role.roleId, md);
}

const validation = validateAllAgentRoleMarkdown(docs);
if (!validation.ok) {
  console.error("Agent frontmatter validation failed:", validation.failures);
  process.exit(1);
}

console.log(
  `Wrote ${roles.length} role contracts with valid YAML frontmatter to ${outDir}`,
);
