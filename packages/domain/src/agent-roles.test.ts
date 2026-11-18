import { describe, expect, it } from "vitest";
import {
  AGENT_ROLE_IDS,
  AGENT_ROLE_CONTRACTS,
  RoleToolClass,
  assertThirtyRolesRegistered,
  getAgentRoleContract,
  isAgentRoleId,
  listAgentRoleContracts,
  roleAllowsTool,
  roleForbidsEffect,
} from "./agent-roles.js";

describe("agent-roles registry (R1-04)", () => {
  it("registers exactly thirty roles A01–A30 in order", () => {
    expect(() => assertThirtyRolesRegistered()).not.toThrow();
    expect(AGENT_ROLE_CONTRACTS).toHaveLength(30);
    expect(AGENT_ROLE_IDS).toHaveLength(30);
    expect(listAgentRoleContracts().map((c) => c.roleId)).toEqual([
      ...AGENT_ROLE_IDS,
    ]);
  });

  it("gives every role a mission, forbidden effects, and evaluation suite", () => {
    for (const role of AGENT_ROLE_CONTRACTS) {
      expect(role.mission.length).toBeGreaterThan(10);
      expect(role.forbiddenEffects.length).toBeGreaterThan(0);
      expect(role.evaluationSuiteId).toMatch(/^eval-A\d{2}-/);
      expect(role.resourceLimits.maxDeadlineSeconds).toBeGreaterThan(0);
      expect(role.resourceLimits.maxDelegationFanout).toBeGreaterThan(0);
    }
  });

  it("forbids credential access on every role; never approves unrestricted shell", () => {
    for (const role of AGENT_ROLE_CONTRACTS) {
      expect(roleForbidsEffect(role.roleId, "credential_access")).toBe(true);
      expect(role.approvedTools).not.toContain("unrestricted_shell" as never);
    }
  });

  it("only A25 may issue review verdicts", () => {
    const reviewers = AGENT_ROLE_CONTRACTS.filter((c) => c.mayIssueReviewVerdicts);
    expect(reviewers.map((r) => r.roleId)).toEqual(["A25"]);
    expect(roleAllowsTool("A25", RoleToolClass.REVIEW_VERDICT)).toBe(true);
    expect(roleAllowsTool("A13", RoleToolClass.REVIEW_VERDICT)).toBe(false);
  });

  it("isAgentRoleId and getAgentRoleContract work", () => {
    expect(isAgentRoleId("A01")).toBe(true);
    expect(isAgentRoleId("A31")).toBe(false);
    expect(getAgentRoleContract("A15").name).toContain("Publisher");
  });
});
