/**
 * Memory/file credential-rotation store — fixture honesty (no DATABASE_URL).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CredentialAuditKind, EffectState } from "@worksocial/domain";
import {
  createFileCredentialRotationStore,
  createMemoryCredentialRotationStore,
} from "./credential-rotation-store.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("credential-rotation store (memory/file)", () => {
  it("memory persists revoke audit and seals liveProviderRevocation NOT_WIRED", async () => {
    const store = createMemoryCredentialRotationStore();
    expect(store.backend).toBe("memory");
    await store.upsertConnection({
      connectionId: "c1",
      providerId: "cms",
      referenceId: "ref-1",
      accountLabel: "fixture",
      status: "ACTIVE",
      connectionState: "READ_READY",
      writeReadiness: "WRITE_READY",
      verificationState: "VERIFIED",
      scopes: ["publish"],
      createdAtIso: "2026-11-21T22:00:00.000Z",
      revokedAtIso: null,
      rotatedToReferenceId: null,
      approvedBy: null,
    });
    await store.appendAudit({
      entryId: "a1",
      kind: CredentialAuditKind.REVOKED,
      connectionId: "c1",
      referenceId: "ref-1",
      summary: "revoked",
      redacted: true,
      recordedAtIso: "2026-11-21T22:01:00.000Z",
      details: {},
    });
    const status = await store.status();
    expect(status.backend).toBe("memory");
    expect(status.liveWiring.liveProviderRevocation).toBe("NOT_WIRED");
    expect(status.externalEffects).toBe("NONE");
    expect(status.catalogClaim).toBe("NOT_RUN");
    expect((await store.listAudit())[0]?.kind).toBe("REVOKED");
  });

  it("file store restarts with queued work", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-cred-store-"));
    dirs.push(dir);
    const first = createFileCredentialRotationStore(dir);
    await first.upsertConnection({
      connectionId: "c2",
      providerId: "cms",
      referenceId: "ref-2",
      accountLabel: "fixture",
      status: "ACTIVE",
      connectionState: "READ_READY",
      writeReadiness: "WRITE_READY",
      verificationState: "VERIFIED",
      scopes: ["publish"],
      createdAtIso: "2026-11-21T22:00:00.000Z",
      revokedAtIso: null,
      rotatedToReferenceId: null,
      approvedBy: null,
    });
    await first.upsertQueuedWork([
      {
        workId: "w1",
        connectionId: "c2",
        capabilityId: "cms_publish",
        operationId: null,
        effectState: EffectState.QUEUED,
        queuedAtIso: "2026-11-21T22:00:00.000Z",
        summary: "queued",
      },
    ]);

    const second = createFileCredentialRotationStore(dir);
    expect(second.backend).toBe("file");
    expect((await second.listConnections())[0]?.connectionId).toBe("c2");
    expect((await second.listQueuedWork("c2"))[0]?.workId).toBe("w1");
    expect((await second.status()).liveWiring.liveProviderRevocation).toBe(
      "NOT_WIRED",
    );
  });
});
