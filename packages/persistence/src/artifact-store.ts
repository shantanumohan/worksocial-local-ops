/**
 * Artifact persistence (M3 / NEXT-12).
 * Immutable revisions with checksums — structured Claude outputs become real artifacts.
 * File-backed + in-memory; schema companion: database/migrations/015_artifacts.sql.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ArtifactTrustLabelValue } from "@worksocial/domain";
import { ArtifactTrustLabel, utf8ByteLength } from "@worksocial/domain";

export type StoredArtifactRevision = {
  artifactId: string;
  revision: string;
  checksum: string;
  trustLabel: ArtifactTrustLabelValue;
  kind: string;
  byteLength: number;
  content: string;
  createdAtIso: string;
  /** Prior revision replaced by this one (null for first). */
  previousRevision: string | null;
  metadata: Readonly<Record<string, string>>;
};

export type ArtifactPutInput = {
  artifactId?: string;
  /** When set, uses this revision id (must be unique per artifact). */
  revision?: string;
  trustLabel: ArtifactTrustLabelValue;
  kind: string;
  content: string;
  createdAtIso: string;
  metadata?: Readonly<Record<string, string>>;
};

export type ArtifactStore = {
  put(input: ArtifactPutInput): StoredArtifactRevision;
  get(
    artifactId: string,
    revision?: string,
  ): StoredArtifactRevision | undefined;
  getLatest(artifactId: string): StoredArtifactRevision | undefined;
  list(artifactId?: string): StoredArtifactRevision[];
};

export type ArtifactStoreState = {
  version: 1;
  updatedAtIso: string;
  revisions: StoredArtifactRevision[];
};

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

function newRevision(): string {
  return `rev-${randomBytes(4).toString("hex")}`;
}

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, filePath);
}

function emptyState(nowIso: string): ArtifactStoreState {
  return { version: 1, updatedAtIso: nowIso, revisions: [] };
}

function latestOf(
  revisions: readonly StoredArtifactRevision[],
  artifactId: string,
): StoredArtifactRevision | undefined {
  return [...revisions]
    .filter((r) => r.artifactId === artifactId)
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))[0];
}

function metadataEqual(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k, i) => k === bKeys[i] && a[k] === b[k]);
}

export class ArtifactStoreError extends Error {
  readonly code: "REVISION_IMMUTABLE" | "REVISION_COLLISION";
  constructor(code: ArtifactStoreError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "ArtifactStoreError";
  }
}

function putInto(
  revisions: StoredArtifactRevision[],
  input: ArtifactPutInput,
): { revision: StoredArtifactRevision; revisions: StoredArtifactRevision[] } {
  const artifactId = input.artifactId ?? newId("art");
  const checksum = sha256Hex(input.content);
  const metadata = input.metadata ?? {};
  const existingLatest = latestOf(revisions, artifactId);

  if (input.revision) {
    const sameRev = revisions.find(
      (r) => r.artifactId === artifactId && r.revision === input.revision,
    );
    if (sameRev) {
      if (
        sameRev.checksum === checksum &&
        sameRev.content === input.content &&
        sameRev.trustLabel === input.trustLabel &&
        sameRev.kind === input.kind &&
        metadataEqual(sameRev.metadata, metadata)
      ) {
        return { revision: sameRev, revisions };
      }
      throw new ArtifactStoreError(
        "REVISION_IMMUTABLE",
        `Artifact ${artifactId}@${input.revision} already exists with different content or trust metadata`,
      );
    }
  }

  // Deduplicate only when content AND trust/kind/metadata are identical.
  if (
    existingLatest &&
    existingLatest.checksum === checksum &&
    existingLatest.content === input.content &&
    existingLatest.trustLabel === input.trustLabel &&
    existingLatest.kind === input.kind &&
    metadataEqual(existingLatest.metadata, metadata) &&
    input.revision === undefined
  ) {
    return { revision: existingLatest, revisions };
  }

  const revision: StoredArtifactRevision = {
    artifactId,
    revision: input.revision ?? newRevision(),
    checksum,
    trustLabel: input.trustLabel,
    kind: input.kind,
    byteLength: utf8ByteLength(input.content),
    content: input.content,
    createdAtIso: input.createdAtIso,
    previousRevision: existingLatest?.revision ?? null,
    metadata,
  };
  return { revision, revisions: [revision, ...revisions] };
}

export function createMemoryArtifactStore(): ArtifactStore {
  let revisions: StoredArtifactRevision[] = [];

  return {
    put(input) {
      const result = putInto(revisions, input);
      revisions = result.revisions;
      return result.revision;
    },
    get(artifactId, revision) {
      if (revision) {
        return revisions.find(
          (r) => r.artifactId === artifactId && r.revision === revision,
        );
      }
      return latestOf(revisions, artifactId);
    },
    getLatest(artifactId) {
      return latestOf(revisions, artifactId);
    },
    list(artifactId) {
      const all = artifactId
        ? revisions.filter((r) => r.artifactId === artifactId)
        : [...revisions];
      return all.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
    },
  };
}

export function createFileArtifactStore(stateDir: string): ArtifactStore {
  const statePath = join(stateDir, "artifacts.json");

  const read = (): ArtifactStoreState => {
    if (!existsSync(statePath)) {
      return emptyState(new Date().toISOString());
    }
    const raw = JSON.parse(
      readFileSync(statePath, "utf8"),
    ) as ArtifactStoreState;
    if (!raw || raw.version !== 1) {
      return emptyState(new Date().toISOString());
    }
    return raw;
  };

  const write = (state: ArtifactStoreState): void => {
    atomicWriteJson(statePath, state);
  };

  return {
    put(input) {
      const state = read();
      const result = putInto(state.revisions, input);
      write({
        version: 1,
        updatedAtIso: input.createdAtIso,
        revisions: result.revisions,
      });
      return result.revision;
    },
    get(artifactId, revision) {
      const state = read();
      if (revision) {
        return state.revisions.find(
          (r) => r.artifactId === artifactId && r.revision === revision,
        );
      }
      return latestOf(state.revisions, artifactId);
    },
    getLatest(artifactId) {
      return latestOf(read().revisions, artifactId);
    },
    list(artifactId) {
      const state = read();
      const all = artifactId
        ? state.revisions.filter((r) => r.artifactId === artifactId)
        : [...state.revisions];
      return all.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
    },
  };
}

export function defaultArtifactStateDir(baseDir: string): string {
  return join(baseDir, "artifacts");
}

/** Helper for tests/fixtures — build a measured evidence artifact. */
export function putMeasuredEvidence(
  store: ArtifactStore,
  input: {
    artifactId: string;
    content: string;
    kind: string;
    createdAtIso: string;
  },
): StoredArtifactRevision {
  return store.put({
    artifactId: input.artifactId,
    trustLabel: ArtifactTrustLabel.MEASURED_EVIDENCE,
    kind: input.kind,
    content: input.content,
    createdAtIso: input.createdAtIso,
  });
}
