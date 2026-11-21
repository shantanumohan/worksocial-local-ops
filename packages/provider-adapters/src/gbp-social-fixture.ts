/**
 * M6 / NEXT-17 — GBP + social (LinkedIn) fixture/simulator adapters.
 *
 * Per-destination format, accept, independent read-back, and recovery.
 * Live GBP / LinkedIn remain NOT_WIRED. External effects: none.
 */

import { createHash, randomBytes } from "node:crypto";

export type DestinationSimulatorMode = "SIMULATOR" | "LIVE_UNAVAILABLE";

export type GbpPostRecord = {
  postId: string;
  variantId: string;
  body: string;
  contentDigest: string;
  revision: string;
  updatedAtIso: string;
};

export type SocialPostRecord = {
  postId: string;
  channel: "linkedin";
  variantId: string;
  title: string;
  body: string;
  contentDigest: string;
  revision: string;
  updatedAtIso: string;
};

export type DestinationApplyOutcome =
  | "ACCEPTED_PENDING"
  | "UNKNOWN_REMOTE_OUTCOME"
  | "FAILED";

export type DestinationApplyResult = {
  outcome: DestinationApplyOutcome;
  remoteId: string | null;
  revision: string | null;
  note: string;
};

export type DestinationReadResult = {
  observedFields: Record<string, string> | null;
  matched: boolean;
  details: string[];
  note: string;
};

function digestFields(fields: Record<string, string>): string {
  const keys = Object.keys(fields).sort();
  const ordered: Record<string, string> = {};
  for (const k of keys) ordered[k] = fields[k]!;
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

function nextRevision(): string {
  return `rev_${randomBytes(4).toString("hex")}`;
}

function fieldsMatch(
  expected: Record<string, string>,
  observed: Record<string, string>,
): { matched: boolean; details: string[] } {
  const details: string[] = [];
  for (const key of Object.keys(expected).sort()) {
    if (observed[key] === undefined) {
      details.push(`Missing field ${key}`);
    } else if (observed[key] !== expected[key]) {
      details.push(`Mismatch on ${key}`);
    }
  }
  if (details.length === 0) {
    return { matched: true, details: ["Independent read matched"] };
  }
  return { matched: false, details };
}

export type GbpFixtureSimulator = {
  readonly mode: DestinationSimulatorMode;
  readonly channel: "gbp";
  apply(input: {
    variantId: string;
    body: string;
    nowIso: string;
    forceUnknownRemote?: boolean;
    forceFailure?: boolean;
  }): DestinationApplyResult;
  independentRead(input: {
    variantId: string;
    expectedBody: string;
  }): DestinationReadResult;
  recover(input: {
    variantId: string;
    body: string;
    nowIso: string;
  }): DestinationApplyResult;
  getPost(variantId: string): GbpPostRecord | undefined;
};

export type LinkedInFixtureSimulator = {
  readonly mode: DestinationSimulatorMode;
  readonly channel: "linkedin";
  apply(input: {
    variantId: string;
    title: string;
    body: string;
    nowIso: string;
    forceUnknownRemote?: boolean;
    forceFailure?: boolean;
  }): DestinationApplyResult;
  independentRead(input: {
    variantId: string;
    expectedTitle: string;
    expectedBody: string;
  }): DestinationReadResult;
  recover(input: {
    variantId: string;
    title: string;
    body: string;
    nowIso: string;
  }): DestinationApplyResult;
  getPost(variantId: string): SocialPostRecord | undefined;
};

/**
 * In-process GBP short-update simulator with durable ledger for read-back.
 */
export function createGbpFixtureSimulator(): GbpFixtureSimulator {
  const posts = new Map<string, GbpPostRecord>();
  const pendingUnknown = new Set<string>();

  return {
    mode: "SIMULATOR",
    channel: "gbp",
    apply(input) {
      if (input.forceFailure) {
        return {
          outcome: "FAILED",
          remoteId: null,
          revision: null,
          note: "Fixture GBP apply forced failure",
        };
      }
      if (input.body.length > 1500) {
        return {
          outcome: "FAILED",
          remoteId: null,
          revision: null,
          note: "GBP short update exceeds fixture max body length",
        };
      }
      if (input.forceUnknownRemote) {
        pendingUnknown.add(input.variantId);
        return {
          outcome: "UNKNOWN_REMOTE_OUTCOME",
          remoteId: null,
          revision: null,
          note: "GBP ack lost — UNKNOWN_REMOTE_OUTCOME; recover before verify",
        };
      }
      const revision = nextRevision();
      const fields = { body: input.body };
      const record: GbpPostRecord = {
        postId: `gbp-${input.variantId}`,
        variantId: input.variantId,
        body: input.body,
        contentDigest: digestFields(fields),
        revision,
        updatedAtIso: input.nowIso,
      };
      posts.set(input.variantId, record);
      pendingUnknown.delete(input.variantId);
      return {
        outcome: "ACCEPTED_PENDING",
        remoteId: record.postId,
        revision,
        note: "Fixture GBP accepted (ACCEPTED_PENDING ≠ verified)",
      };
    },
    independentRead(input) {
      if (pendingUnknown.has(input.variantId)) {
        return {
          observedFields: null,
          matched: false,
          details: ["UNKNOWN_REMOTE_OUTCOME — nothing to read yet"],
          note: "Recover required before independent GBP read",
        };
      }
      const post = posts.get(input.variantId);
      if (!post) {
        return {
          observedFields: null,
          matched: false,
          details: ["GBP post missing from fixture ledger"],
          note: "Independent GBP read failed",
        };
      }
      const observed = { body: post.body };
      const comparison = fieldsMatch({ body: input.expectedBody }, observed);
      return {
        observedFields: observed,
        matched: comparison.matched,
        details: comparison.details,
        note: comparison.matched
          ? "Independent GBP read matched"
          : "Independent GBP read mismatched",
      };
    },
    recover(input) {
      pendingUnknown.delete(input.variantId);
      return this.apply({
        variantId: input.variantId,
        body: input.body,
        nowIso: input.nowIso,
      });
    },
    getPost(variantId) {
      return posts.get(variantId);
    },
  };
}

/**
 * In-process LinkedIn social simulator (the single M6 social destination).
 */
export function createLinkedInFixtureSimulator(): LinkedInFixtureSimulator {
  const posts = new Map<string, SocialPostRecord>();
  const pendingUnknown = new Set<string>();

  return {
    mode: "SIMULATOR",
    channel: "linkedin",
    apply(input) {
      if (input.forceFailure) {
        return {
          outcome: "FAILED",
          remoteId: null,
          revision: null,
          note: "Fixture LinkedIn apply forced failure",
        };
      }
      if (input.forceUnknownRemote) {
        pendingUnknown.add(input.variantId);
        return {
          outcome: "UNKNOWN_REMOTE_OUTCOME",
          remoteId: null,
          revision: null,
          note: "LinkedIn ack lost — UNKNOWN_REMOTE_OUTCOME; recover before verify",
        };
      }
      const revision = nextRevision();
      const fields = { title: input.title, body: input.body };
      const record: SocialPostRecord = {
        postId: `li-${input.variantId}`,
        channel: "linkedin",
        variantId: input.variantId,
        title: input.title,
        body: input.body,
        contentDigest: digestFields(fields),
        revision,
        updatedAtIso: input.nowIso,
      };
      posts.set(input.variantId, record);
      pendingUnknown.delete(input.variantId);
      return {
        outcome: "ACCEPTED_PENDING",
        remoteId: record.postId,
        revision,
        note: "Fixture LinkedIn accepted (ACCEPTED_PENDING ≠ verified)",
      };
    },
    independentRead(input) {
      if (pendingUnknown.has(input.variantId)) {
        return {
          observedFields: null,
          matched: false,
          details: ["UNKNOWN_REMOTE_OUTCOME — nothing to read yet"],
          note: "Recover required before independent LinkedIn read",
        };
      }
      const post = posts.get(input.variantId);
      if (!post) {
        return {
          observedFields: null,
          matched: false,
          details: ["LinkedIn post missing from fixture ledger"],
          note: "Independent LinkedIn read failed",
        };
      }
      const observed = { title: post.title, body: post.body };
      const comparison = fieldsMatch(
        { title: input.expectedTitle, body: input.expectedBody },
        observed,
      );
      return {
        observedFields: observed,
        matched: comparison.matched,
        details: comparison.details,
        note: comparison.matched
          ? "Independent LinkedIn read matched"
          : "Independent LinkedIn read mismatched",
      };
    },
    recover(input) {
      pendingUnknown.delete(input.variantId);
      return this.apply({
        variantId: input.variantId,
        title: input.title,
        body: input.body,
        nowIso: input.nowIso,
      });
    },
    getPost(variantId) {
      return posts.get(variantId);
    },
  };
}

export function liveGbpUnavailable(): {
  mode: "LIVE_UNAVAILABLE";
  note: string;
} {
  return {
    mode: "LIVE_UNAVAILABLE",
    note: "Live GBP publish is NOT_WIRED without ownership verification and credentials",
  };
}

export function liveLinkedInUnavailable(): {
  mode: "LIVE_UNAVAILABLE";
  note: string;
} {
  return {
    mode: "LIVE_UNAVAILABLE",
    note: "Live LinkedIn publish is NOT_WIRED without org role and credentials",
  };
}
