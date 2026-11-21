/**
 * File-backed identity/authority state for R1-02.
 * Honest interim until Postgres is bound (see 003_identity_authority.sql).
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { resolveWorkSocialStateDir } from "./host-paths.js";
import type {
  CapabilityGrant,
  LocalUserRecord,
  OperatingModeValue,
  ProviderStatusView,
  SessionRecord,
  StandingPolicy,
} from "@worksocial/domain";
import {
  ActionClass,
  ConnectionState,
  LocalRole,
  OperatingMode,
  VerificationState,
  WriteReadiness,
  buildProviderStatusView,
} from "@worksocial/domain";

export type PolicyDecisionRecord = {
  decisionId: string;
  operationId: string;
  payloadDigest: string;
  allowed: boolean;
  code: string | null;
  reason: string;
  grantId: string | null;
  policyId: string | null;
  decidedAtIso: string;
};

export type AuthorityAuditEvent = {
  eventId: string;
  actorUserId: string | null;
  eventType: string;
  detail: string;
  createdAtIso: string;
};

export type OwnerControls = {
  outboundStopped: boolean;
  operatingMode: OperatingModeValue;
  updatedAtIso: string;
  updatedByUserId: string | null;
};

export type AuthorityState = {
  version: 1;
  users: LocalUserRecord[];
  sessions: SessionRecord[];
  standingPolicies: StandingPolicy[];
  capabilityGrants: CapabilityGrant[];
  policyDecisions: PolicyDecisionRecord[];
  ownerControls: OwnerControls;
  providerStatuses: ProviderStatusView[];
  auditEvents: AuthorityAuditEvent[];
  updatedAt: string;
};

export type AuthorityStore = {
  readonly stateDir: string;
  read(): AuthorityState;
  write(state: AuthorityState): void;
  update(mutator: (current: AuthorityState) => AuthorityState): AuthorityState;
};

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string, salt?: string): string {
  const usedSalt = salt ?? randomBytes(16).toString("hex");
  const derived = scryptSync(password, usedSalt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${usedSalt}$${derived}`;
}

export function verifyPassword(password: string, verifier: string): boolean {
  const parts = verifier.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const salt = parts[1]!;
  const expectedHex = parts[2]!;
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export function defaultProviderStatuses(): ProviderStatusView[] {
  // R1-02: no live providers. Honest NOT_CONFIGURED — never fake connected.
  return [
    buildProviderStatusView({
      providerId: "owned-site",
      connectionState: ConnectionState.NOT_CONFIGURED,
      writeReadiness: WriteReadiness.NOT_AUTHORIZED,
      verificationState: VerificationState.NOT_VERIFIED,
    }),
    buildProviderStatusView({
      providerId: "crm",
      connectionState: ConnectionState.NOT_CONFIGURED,
      writeReadiness: WriteReadiness.NOT_AUTHORIZED,
      verificationState: VerificationState.NOT_VERIFIED,
    }),
  ];
}

export function emptyAuthorityState(nowIso: string): AuthorityState {
  return {
    version: 1,
    users: [],
    sessions: [],
    standingPolicies: [],
    capabilityGrants: [],
    policyDecisions: [],
    ownerControls: {
      outboundStopped: false,
      operatingMode: OperatingMode.OBSERVE,
      updatedAtIso: nowIso,
      updatedByUserId: null,
    },
    providerStatuses: defaultProviderStatuses(),
    auditEvents: [],
    updatedAt: nowIso,
  };
}

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function createFileAuthorityStore(stateDir: string): AuthorityStore {
  const statePath = join(stateDir, "authority-state.json");

  const read = (): AuthorityState => {
    const existing = readJsonFile<AuthorityState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyAuthorityState(new Date().toISOString());
    }
    return existing;
  };

  const write = (state: AuthorityState): void => {
    atomicWriteJson(statePath, state);
  };

  const update = (
    mutator: (current: AuthorityState) => AuthorityState,
  ): AuthorityState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return { stateDir, read, write, update };
}

export type BootstrapOwnerOptions = {
  username?: string;
  password?: string;
  nowIso?: string;
};

/**
 * Ensures a single local administrator exists. Local-dev default password is
 * documented in README; override with WORKSOCIAL_OWNER_PASSWORD.
 */
export function ensureBootstrapOwner(
  store: AuthorityStore,
  options: BootstrapOwnerOptions = {},
): LocalUserRecord {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const username = options.username ?? "owner";
  const password = options.password ?? "local-owner-change-me";

  const current = store.read();
  const existing = current.users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase(),
  );
  if (existing) {
    return existing;
  }

  const user: LocalUserRecord = {
    userId: `user-${randomBytes(8).toString("hex")}`,
    username,
    role: LocalRole.ADMINISTRATOR,
    passwordVerifier: hashPassword(password),
    createdAtIso: nowIso,
    disabled: false,
  };

  store.update((state) => ({
    ...state,
    users: [...state.users, user],
    auditEvents: [
      ...state.auditEvents,
      {
        eventId: `evt-${randomBytes(6).toString("hex")}`,
        actorUserId: user.userId,
        eventType: "owner_bootstrapped",
        detail: `Local administrator '${username}' created (no cloud IdP).`,
        createdAtIso: nowIso,
      },
    ],
    updatedAt: nowIso,
  }));

  return user;
}

/** Demo standing policy+grant for contract tests — disabled by default in empty stores. */
export function createDemoPublishGrant(nowIso: string): {
  policy: StandingPolicy;
  grant: CapabilityGrant;
} {
  const policy: StandingPolicy = {
    policyId: "pol-demo-publish",
    version: 1,
    actorRole: LocalRole.ADMINISTRATOR,
    channelId: "owned-site",
    actionClass: ActionClass.ROUTINE_PUBLISH,
    allowedAssetScope: ["page-home"],
    enabled: true,
    emergencyStopApplies: true,
    expiresAtIso: null,
    createdAtIso: nowIso,
  };
  const grant: CapabilityGrant = {
    grantId: "grant-demo-publish",
    policyId: policy.policyId,
    targetAccountId: "acct-demo",
    allowedOperations: ["publish_page"],
    allowedAssetScope: ["page-home"],
    contentRevisionBound: "rev-demo",
    rateLimitPerHour: 5,
    expiresAtIso: null,
    revoked: false,
    createdAtIso: nowIso,
  };
  return { policy, grant };
}

/**
 * Standing policies+grants for R1-08 content distribution fixtures.
 * Separate channels for CMS, GBP, LinkedIn, and Facebook.
 * assetId/contentRevision must match the reviewed article id + digest.
 */
export function createDemoContentDistributionGrants(
  nowIso: string,
  options?: {
    assetId?: string;
    contentRevision?: string;
  },
): {
  policy: StandingPolicy;
  grant: CapabilityGrant;
  gbpPolicy: StandingPolicy;
  gbpGrant: CapabilityGrant;
  linkedinPolicy: StandingPolicy;
  linkedinGrant: CapabilityGrant;
  facebookPolicy: StandingPolicy;
  facebookGrant: CapabilityGrant;
} {
  const assetId = options?.assetId ?? "golden-art-training";
  const contentRevision = options?.contentRevision ?? null;
  const assetScope = [assetId];
  const policy: StandingPolicy = {
    policyId: "pol-demo-content-cms",
    version: 1,
    actorRole: LocalRole.ADMINISTRATOR,
    channelId: "owned-site",
    actionClass: ActionClass.ROUTINE_PUBLISH,
    allowedAssetScope: assetScope,
    enabled: true,
    emergencyStopApplies: true,
    expiresAtIso: null,
    createdAtIso: nowIso,
  };
  const grant: CapabilityGrant = {
    grantId: "grant-demo-content-cms",
    policyId: policy.policyId,
    targetAccountId: "acct-demo",
    allowedOperations: ["publish_article"],
    allowedAssetScope: assetScope,
    contentRevisionBound: contentRevision,
    rateLimitPerHour: 5,
    expiresAtIso: null,
    revoked: false,
    createdAtIso: nowIso,
  };
  const gbpPolicy: StandingPolicy = {
    policyId: "pol-demo-content-gbp",
    version: 1,
    actorRole: LocalRole.ADMINISTRATOR,
    channelId: "gbp",
    actionClass: ActionClass.ROUTINE_PUBLISH,
    allowedAssetScope: assetScope,
    enabled: true,
    emergencyStopApplies: true,
    expiresAtIso: null,
    createdAtIso: nowIso,
  };
  const gbpGrant: CapabilityGrant = {
    grantId: "grant-demo-content-gbp",
    policyId: gbpPolicy.policyId,
    targetAccountId: "acct-demo",
    allowedOperations: ["publish_gbp_update"],
    allowedAssetScope: assetScope,
    contentRevisionBound: contentRevision,
    rateLimitPerHour: 5,
    expiresAtIso: null,
    revoked: false,
    createdAtIso: nowIso,
  };
  const linkedinPolicy: StandingPolicy = {
    policyId: "pol-demo-content-linkedin",
    version: 1,
    actorRole: LocalRole.ADMINISTRATOR,
    channelId: "linkedin",
    actionClass: ActionClass.ROUTINE_PUBLISH,
    allowedAssetScope: assetScope,
    enabled: true,
    emergencyStopApplies: true,
    expiresAtIso: null,
    createdAtIso: nowIso,
  };
  const linkedinGrant: CapabilityGrant = {
    grantId: "grant-demo-content-linkedin",
    policyId: linkedinPolicy.policyId,
    targetAccountId: "acct-demo",
    allowedOperations: ["publish_social_post"],
    allowedAssetScope: assetScope,
    contentRevisionBound: contentRevision,
    rateLimitPerHour: 5,
    expiresAtIso: null,
    revoked: false,
    createdAtIso: nowIso,
  };
  const facebookPolicy: StandingPolicy = {
    policyId: "pol-demo-content-facebook",
    version: 1,
    actorRole: LocalRole.ADMINISTRATOR,
    channelId: "facebook",
    actionClass: ActionClass.ROUTINE_PUBLISH,
    allowedAssetScope: assetScope,
    enabled: true,
    emergencyStopApplies: true,
    expiresAtIso: null,
    createdAtIso: nowIso,
  };
  const facebookGrant: CapabilityGrant = {
    grantId: "grant-demo-content-facebook",
    policyId: facebookPolicy.policyId,
    targetAccountId: "acct-demo",
    allowedOperations: ["publish_social_post"],
    allowedAssetScope: assetScope,
    contentRevisionBound: contentRevision,
    rateLimitPerHour: 5,
    expiresAtIso: null,
    revoked: false,
    createdAtIso: nowIso,
  };
  return {
    policy,
    grant,
    gbpPolicy,
    gbpGrant,
    linkedinPolicy,
    linkedinGrant,
    facebookPolicy,
    facebookGrant,
  };
}

/** Standing policy+grant for fixture form-to-CRM canaries (R1-05). */
export function createDemoCanaryGrant(nowIso: string): {
  policy: StandingPolicy;
  grant: CapabilityGrant;
} {
  const policy: StandingPolicy = {
    policyId: "pol-demo-form-canary",
    version: 1,
    actorRole: LocalRole.ADMINISTRATOR,
    channelId: "owned-site",
    actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
    allowedAssetScope: ["page-contact"],
    enabled: true,
    emergencyStopApplies: true,
    expiresAtIso: null,
    createdAtIso: nowIso,
  };
  const grant: CapabilityGrant = {
    grantId: "grant-demo-form-canary",
    policyId: policy.policyId,
    targetAccountId: "acct-fixture-canary",
    allowedOperations: ["submit_form_canary"],
    allowedAssetScope: ["page-contact"],
    contentRevisionBound: null,
    rateLimitPerHour: 12,
    expiresAtIso: null,
    revoked: false,
    createdAtIso: nowIso,
  };
  return { policy, grant };
}

/** Standing policies+grants for fixture after-hours reply + CRM lead (R1-09). */
export function createDemoInboxGrants(nowIso: string): {
  replyPolicy: StandingPolicy;
  replyGrant: CapabilityGrant;
  leadPolicy: StandingPolicy;
  leadGrant: CapabilityGrant;
} {
  // Scope to the golden conversation id (not a shared fixture asset label) so
  // gateway authorization cannot authorize arbitrary ingested threads.
  const assetScope = [
    "golden-conv-after-hours",
    "lead-fixture-after-hours",
  ];
  const replyPolicy: StandingPolicy = {
    policyId: "pol-demo-inbox-reply",
    version: 1,
    actorRole: LocalRole.ADMINISTRATOR,
    channelId: "inbox",
    actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
    allowedAssetScope: assetScope,
    enabled: true,
    emergencyStopApplies: true,
    expiresAtIso: null,
    createdAtIso: nowIso,
  };
  const replyGrant: CapabilityGrant = {
    grantId: "grant-demo-inbox-reply",
    policyId: replyPolicy.policyId,
    targetAccountId: "acct-demo",
    allowedOperations: ["send_customer_reply"],
    allowedAssetScope: assetScope,
    contentRevisionBound: "rev-inbox-demo",
    rateLimitPerHour: 30,
    expiresAtIso: null,
    revoked: false,
    createdAtIso: nowIso,
  };
  const leadPolicy: StandingPolicy = {
    policyId: "pol-demo-inbox-crm-lead",
    version: 1,
    actorRole: LocalRole.ADMINISTRATOR,
    channelId: "crm",
    actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
    allowedAssetScope: assetScope,
    enabled: true,
    emergencyStopApplies: true,
    expiresAtIso: null,
    createdAtIso: nowIso,
  };
  const leadGrant: CapabilityGrant = {
    grantId: "grant-demo-inbox-crm-lead",
    policyId: leadPolicy.policyId,
    targetAccountId: "acct-demo",
    allowedOperations: ["log_qualified_lead"],
    allowedAssetScope: assetScope,
    contentRevisionBound: null,
    rateLimitPerHour: 30,
    expiresAtIso: null,
    revoked: false,
    createdAtIso: nowIso,
  };
  return { replyPolicy, replyGrant, leadPolicy, leadGrant };
}

/** Standing policy+grant for fixture bounded repair release (R1-10). */
export function createDemoRepairGrant(nowIso: string): {
  policy: StandingPolicy;
  grant: CapabilityGrant;
} {
  const assetScope = ["page-home-cta"];
  const policy: StandingPolicy = {
    policyId: "pol-demo-bounded-repair",
    version: 1,
    actorRole: LocalRole.ADMINISTRATOR,
    channelId: "owned-site",
    actionClass: ActionClass.BOUNDED_REPAIR,
    allowedAssetScope: assetScope,
    enabled: true,
    emergencyStopApplies: true,
    expiresAtIso: null,
    createdAtIso: nowIso,
  };
  const grant: CapabilityGrant = {
    grantId: "grant-demo-bounded-repair",
    policyId: policy.policyId,
    targetAccountId: "acct-demo",
    allowedOperations: ["apply_bounded_repair"],
    allowedAssetScope: assetScope,
    contentRevisionBound: "rev-repair-demo",
    rateLimitPerHour: 10,
    expiresAtIso: null,
    revoked: false,
    createdAtIso: nowIso,
  };
  return { policy, grant };
}

export function defaultAuthorityStateDir(_repoRoot?: string): string {
  // Shared control-plane root — outside the checkout by default (see host-paths).
  return resolveWorkSocialStateDir();
}
