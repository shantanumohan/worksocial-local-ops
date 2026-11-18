/**
 * Learning proposals must never silently expand grants, spend, CRM write, or publish authority.
 */

export type AuthorityImpactFlags = {
  expandsGrants: false;
  expandsSpend: false;
  expandsCrmWrite: false;
  expandsPublish: false;
};

export const FORBIDDEN_AUTHORITY_EXPANSION_KEYS = [
  "grantId",
  "capabilityGrants",
  "standingPolicies",
  "spendLimit",
  "budgetIncrease",
  "crmWrite",
  "publishAuthority",
  "allowedOperations",
  "rateLimitPerHour",
  "actionClass",
] as const;

export const FIXED_NON_EXPANDING_AUTHORITY: AuthorityImpactFlags = {
  expandsGrants: false,
  expandsSpend: false,
  expandsCrmWrite: false,
  expandsPublish: false,
};

export function assertAuthorityNonExpansion(
  authorityImpact: AuthorityImpactFlags,
  payload: Readonly<Record<string, unknown>>,
): void {
  if (
    authorityImpact.expandsGrants !== false ||
    authorityImpact.expandsSpend !== false ||
    authorityImpact.expandsCrmWrite !== false ||
    authorityImpact.expandsPublish !== false
  ) {
    throw new Error(
      "Learning proposals cannot expand grants, spend, CRM write, or publish authority",
    );
  }

  for (const key of FORBIDDEN_AUTHORITY_EXPANSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      throw new Error(
        `Learning proposal payload must not include authority-expansion field '${key}'`,
      );
    }
  }
}

/**
 * Learning-worker has no production effect credentials and no action-gateway write principal.
 */
export type LearningIsolationContext = {
  principal: string;
  hasActionGatewayWritePrincipal: boolean;
  hasProductionEffectCredentials: boolean;
};

export function assertLearningWorkerIsolation(
  ctx: LearningIsolationContext,
): void {
  if (ctx.principal !== "learning-worker") {
    throw new Error(
      `Learning isolation requires principal 'learning-worker', got '${ctx.principal}'`,
    );
  }
  if (ctx.hasActionGatewayWritePrincipal) {
    throw new Error(
      "learning-worker must not hold an action-gateway write principal",
    );
  }
  if (ctx.hasProductionEffectCredentials) {
    throw new Error(
      "learning-worker must not hold production effect credentials",
    );
  }
}
