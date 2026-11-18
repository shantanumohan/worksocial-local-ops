import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AdapterWiring,
  BindingKind,
  ConnectionState,
  EvidenceKind,
  VerificationState,
  WriteReadiness,
  createFixturePilotMapping,
  createReadEvidence,
  proveFixturePilotWritePath,
  resolvePilotWriteGates,
  ActionClass,
} from "@worksocial/domain";
import { createFileProductionMappingStore } from "./production-mapping-store.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("production-mapping-store", () => {
  it("persists bindings, ownership, and read evidence across reads", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-map-"));
    dirs.push(dir);
    const store = createFileProductionMappingStore(dir);
    const now = "2026-11-18T16:00:00.000Z";
    const { state, writePathId } = createFixturePilotMapping(now);

    store.write(state);
    const reloaded = createFileProductionMappingStore(dir).read();
    expect(reloaded.writePaths[0]?.writePathId).toBe(writePathId);
    expect(reloaded.bindings[0]?.ownershipProven).toBe(false);

    const proven = proveFixturePilotWritePath(reloaded, writePathId, now);
    store.write(proven);

    const again = store.read();
    const gates = resolvePilotWriteGates({
      actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
      writePathId,
      channelId: "owned-site",
      assetId: "page-contact",
      operation: "submit_form_canary",
      mapping: again,
    });
    expect(gates.ownershipProven).toBe(true);
    expect(gates.readEvidencePresent).toBe(true);
    expect(again.readEvidence).toHaveLength(5);
  });

  it("upserts binding and appends fixture read evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-map-"));
    dirs.push(dir);
    const store = createFileProductionMappingStore(dir);
    const now = "2026-11-18T16:10:00.000Z";

    store.upsertBinding({
      bindingId: "bind-1",
      siteId: "site-a",
      kind: BindingKind.CMS,
      resourceRef: "cms://fixture/item-1",
      displayName: "Fixture CMS item",
      identityLabel: null,
      connectionState: ConnectionState.NOT_CONFIGURED,
      writeReadiness: WriteReadiness.NOT_AUTHORIZED,
      verificationState: VerificationState.NOT_VERIFIED,
      ownershipProven: false,
      observedRevision: null,
      adapterWiring: AdapterWiring.FIXTURE,
      createdAtIso: now,
      updatedAtIso: now,
    });
    store.upsertWritePath({
      writePathId: "wp-1",
      channelId: "owned-site",
      assetId: "page-a",
      operation: "publish_page",
      siteId: "site-a",
      bindingId: "bind-1",
      formId: null,
      bookingOwnershipId: null,
      crmOwnershipId: null,
      requiredEvidenceKinds: [EvidenceKind.IDENTITY],
      createdAtIso: now,
    });
    store.addReadEvidence(
      createReadEvidence({
        evidenceId: "ev-1",
        writePathId: "wp-1",
        evidenceKind: EvidenceKind.IDENTITY,
        resourceType: "binding",
        resourceId: "bind-1",
        operation: "fixture_identity",
        summary: "Fixture identity observed",
        fixtureOnly: true,
        observedAtIso: now,
        adapterWiring: AdapterWiring.FIXTURE,
      }),
    );

    const state = store.read();
    expect(state.sites).toContain("site-a");
    expect(state.readEvidence).toHaveLength(1);
    expect(state.bindings[0]?.kind).toBe(BindingKind.CMS);
  });
});
