/**
 * Honest connection / authorization / verification labels (v5 § invariants).
 * Never promote a weaker evidence class to "connected", "authorized", or "verified".
 */

export const ConnectionState = {
  NOT_CONFIGURED: "NOT_CONFIGURED",
  AWAITING_AUTHORIZATION: "AWAITING_AUTHORIZATION",
  IDENTITY_BOUND: "IDENTITY_BOUND",
  READ_READY: "READ_READY",
  NEEDS_REAUTH: "NEEDS_REAUTH",
  WRONG_RESOURCE: "WRONG_RESOURCE",
  UNSUPPORTED: "UNSUPPORTED",
  DEGRADED: "DEGRADED",
  REVOKED: "REVOKED",
} as const;

export type ConnectionStateValue =
  (typeof ConnectionState)[keyof typeof ConnectionState];

export const WriteReadiness = {
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  STAGING_READY: "STAGING_READY",
  WRITE_READY: "WRITE_READY",
  BLOCKED: "BLOCKED",
} as const;

export type WriteReadinessValue =
  (typeof WriteReadiness)[keyof typeof WriteReadiness];

export const VerificationState = {
  NOT_VERIFIED: "NOT_VERIFIED",
  ACCEPTED_PENDING: "ACCEPTED_PENDING",
  VERIFIED: "VERIFIED",
  UNKNOWN_REMOTE_OUTCOME: "UNKNOWN_REMOTE_OUTCOME",
} as const;

export type VerificationStateValue =
  (typeof VerificationState)[keyof typeof VerificationState];

export type ProviderStatusView = {
  providerId: string;
  /** Account/session identity evidence only — not permission to act. */
  connected: boolean;
  connectionState: ConnectionStateValue;
  /** Standing grant / write readiness — independent of connection. */
  authorized: boolean;
  writeReadiness: WriteReadinessValue;
  /** Environment evidence — never inferred from acceptance alone. */
  verified: boolean;
  verificationState: VerificationStateValue;
  labels: {
    connected: string;
    authorized: string;
    verified: string;
  };
};

export type ProviderStatusInput = {
  providerId: string;
  connectionState: ConnectionStateValue;
  writeReadiness: WriteReadinessValue;
  verificationState: VerificationStateValue;
};

const CONNECTED_STATES: ReadonlySet<ConnectionStateValue> = new Set([
  ConnectionState.IDENTITY_BOUND,
  ConnectionState.READ_READY,
  ConnectionState.DEGRADED,
]);

export function isConnected(state: ConnectionStateValue): boolean {
  return CONNECTED_STATES.has(state);
}

export function isAuthorized(write: WriteReadinessValue): boolean {
  return (
    write === WriteReadiness.STAGING_READY || write === WriteReadiness.WRITE_READY
  );
}

export function isVerified(state: VerificationStateValue): boolean {
  return state === VerificationState.VERIFIED;
}

/**
 * Build an honest status view. Acceptance (ACCEPTED_PENDING) never sets verified=true.
 * A local password / fixture does not imply connected.
 */
export function buildProviderStatusView(
  input: ProviderStatusInput,
): ProviderStatusView {
  const connected = isConnected(input.connectionState);
  const authorized = isAuthorized(input.writeReadiness);
  const verified = isVerified(input.verificationState);

  return {
    providerId: input.providerId,
    connected,
    connectionState: input.connectionState,
    authorized,
    writeReadiness: input.writeReadiness,
    verified,
    verificationState: input.verificationState,
    labels: {
      connected: connected
        ? `Connected (${input.connectionState})`
        : `Not connected (${input.connectionState})`,
      authorized: authorized
        ? `Authorized (${input.writeReadiness})`
        : `Not authorized (${input.writeReadiness})`,
      verified: verified
        ? "Verified (environment evidence)"
        : input.verificationState === VerificationState.ACCEPTED_PENDING
          ? "Accepted pending — not verified"
          : `Not verified (${input.verificationState})`,
    },
  };
}
