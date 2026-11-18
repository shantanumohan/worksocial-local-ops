/**
 * File-backed identity/authority state for R1-02.
 * Honest interim until Postgres is bound (see 003_identity_authority.sql).
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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

export function defaultAuthorityStateDir(repoRoot: string): string {
  return join(repoRoot, ".worksocial", "local-state");
}
