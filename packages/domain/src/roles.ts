/**
 * Local console/API roles for a single-owner host (R1-02).
 * Pure types and helpers — no network or Node crypto.
 */

export const LocalRole = {
  ADMINISTRATOR: "administrator",
  OPERATOR: "operator",
} as const;

export type LocalRoleValue = (typeof LocalRole)[keyof typeof LocalRole];

export const LOCAL_ROLES: readonly LocalRoleValue[] = [
  LocalRole.ADMINISTRATOR,
  LocalRole.OPERATOR,
];

export function isLocalRole(value: string): value is LocalRoleValue {
  return (LOCAL_ROLES as readonly string[]).includes(value);
}

/** Privileged actions that require administrator. */
export type PrivilegedAction =
  | "manage_standing_policies"
  | "manage_capability_grants"
  | "toggle_stop_switch"
  | "manage_users"
  | "view_audit";

const ADMINISTRATOR_ONLY: ReadonlySet<PrivilegedAction> = new Set([
  "manage_standing_policies",
  "manage_capability_grants",
  "toggle_stop_switch",
  "manage_users",
  "view_audit",
]);

export function roleMayPerform(
  role: LocalRoleValue,
  action: PrivilegedAction,
): boolean {
  if (role === LocalRole.ADMINISTRATOR) {
    return true;
  }
  return !ADMINISTRATOR_ONLY.has(action);
}

/** Operator may view authority state but not mutate policy/stop. */
export function roleMayViewAuthority(role: LocalRoleValue): boolean {
  return isLocalRole(role);
}
