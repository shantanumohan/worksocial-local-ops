import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AGENT_ROLE_IDS } from "./agent-roles.js";
import {
  parseAgentMarkdown,
  registeredAgentName,
  renderAgentRoleMarkdown,
  roleIdFromRegisteredAgentName,
  validateAllAgentRoleMarkdown,
  validateAgentMarkdownForRole,
} from "./agent-frontmatter.js";

describe("agent frontmatter (F01)", () => {
  it("maps internal IDs to registered Claude agent names 1:1", () => {
    for (const roleId of AGENT_ROLE_IDS) {
      expect(registeredAgentName(roleId)).toBe(roleId);
      expect(roleIdFromRegisteredAgentName(registeredAgentName(roleId))).toBe(
        roleId,
      );
    }
  });

  it("rejects markdown without YAML frontmatter", () => {
    const result = parseAgentMarkdown("# A01 — Operations Commander\n");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/frontmatter/i);
  });

  it("requires name and description", () => {
    expect(
      parseAgentMarkdown("---\nname: A01\n---\n\nbody\n").ok,
    ).toBe(false);
    expect(
      parseAgentMarkdown("---\ndescription: only desc\n---\n\nbody\n").ok,
    ).toBe(false);
  });

  it("parses valid frontmatter and keeps body", () => {
    const md = `---
name: A01
description: "WorkSocial role A01"
---

# Body

Hello
`;
    const result = parseAgentMarkdown(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.frontmatter.name).toBe("A01");
    expect(result.parsed.frontmatter.description).toContain("A01");
    expect(result.parsed.body).toContain("# Body");
  });

  it("renderAgentRoleMarkdown emits valid mapped frontmatter for all thirty roles", () => {
    const docs = new Map(
      AGENT_ROLE_IDS.map((id) => [id, renderAgentRoleMarkdown(id)] as const),
    );
    const validation = validateAllAgentRoleMarkdown(docs);
    expect(validation.ok).toBe(true);
    expect(validation.checked).toBe(30);
    expect(validation.failures).toEqual([]);
  });

  it("validates checked-in .claude/agents A01–A30 markdown", () => {
    const root = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
    );
    const agentsDir = join(root, ".claude", "agents");
    const docs = new Map(
      AGENT_ROLE_IDS.map((id) => {
        const path = join(agentsDir, `${id}.md`);
        return [id, readFileSync(path, "utf8")] as const;
      }),
    );
    const validation = validateAllAgentRoleMarkdown(docs);
    expect(validation.failures).toEqual([]);
    expect(validation.ok).toBe(true);
    for (const roleId of AGENT_ROLE_IDS) {
      const result = validateAgentMarkdownForRole(roleId, docs.get(roleId)!);
      expect(result.ok).toBe(true);
    }
  });
});
