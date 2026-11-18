import { describe, expect, it } from "vitest";
import { ActionClass } from "./standing-authority.js";
import {
  AdapterWiring,
  EvidenceKind,
  OutcomeEvidenceSource,
  OutcomeLabel,
  assertNonEmptyEvidenceKinds,
  createFixturePilotMapping,
  createReadEvidence,
  emptyProductionMappingState,
  listWritePathOutcomesForLearning,
  proveFixturePilotWritePath,
  recordWritePathOutcome,
  resolvePilotWriteGates,
  upsertFixturePilotMapping,
} from "./production-mapping.js";

const now = "2026-11-18T15:00:00.000Z";

describe("production mapping write gates", () => {
  it("allows observe without a mapped write path", () => {
    const { state } = createFixturePilotMapping(now);
    const gates = resolvePilotWriteGates({
      actionClass: ActionClass.OBSERVE,
      channelId: "owned-site",
      assetId: "page-contact",
      operation: "fetch_page",
      mapping: state,
    });
    expect(gates.ownershipProven).toBe(true);
    expect(gates.readEvidencePresent).toBe(true);
    expect(gates.prerequisiteMissing).toBe(false);
  });

  it("denies write when ownership and read evidence are missing", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const gates = resolvePilotWriteGates({
      actionClass: ActionClass.ROUTINE_PUBLISH,
      writePathId,
      channelId: "owned-site",
      assetId: "page-contact",
      operation: "submit_form_canary",
      mapping: state,
    });
    expect(gates.matchedWritePath?.writePathId).toBe(writePathId);
    expect(gates.ownershipProven).toBe(false);
    expect(gates.readEvidencePresent).toBe(false);
    expect(gates.prerequisiteMissing).toBe(true);
    expect(gates.missingEvidenceKinds.length).toBeGreaterThan(0);
  });

  it("passes gates only after ownership + full read evidence", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const proven = proveFixturePilotWritePath(state, writePathId, now);
    const gates = resolvePilotWriteGates({
      actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
      writePathId,
      channelId: "owned-site",
      assetId: "page-contact",
      operation: "submit_form_canary",
      mapping: proven,
    });
    expect(gates.ownershipProven).toBe(true);
    expect(gates.readEvidencePresent).toBe(true);
    expect(gates.prerequisiteMissing).toBe(false);
    expect(gates.missingEvidenceKinds).toEqual([]);
  });

  it("fails closed when no write path is registered", () => {
    const { state } = createFixturePilotMapping(now);
    const gates = resolvePilotWriteGates({
      actionClass: ActionClass.ROUTINE_PUBLISH,
      channelId: "owned-site",
      assetId: "page-other",
      operation: "publish_page",
      mapping: state,
    });
    expect(gates.ownershipProven).toBe(false);
    expect(gates.readEvidencePresent).toBe(false);
    expect(gates.matchedWritePath).toBeNull();
  });

  it("refuses LIVE adapter read evidence in R1-03", () => {
    expect(() =>
      createReadEvidence({
        evidenceId: "ev-1",
        writePathId: "wp-1",
        evidenceKind: EvidenceKind.IDENTITY,
        resourceType: "binding",
        resourceId: "b1",
        operation: "read_identity",
        summary: "should fail",
        fixtureOnly: false,
        observedAtIso: now,
        adapterWiring: AdapterWiring.LIVE,
      }),
    ).toThrow(/refuses LIVE/);
  });

  it("fails closed when writePathId does not match intent channel/asset/operation", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const proven = proveFixturePilotWritePath(state, writePathId, now);
    const gates = resolvePilotWriteGates({
      actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
      writePathId,
      channelId: "owned-site",
      assetId: "page-other",
      operation: "publish_page",
      mapping: proven,
    });
    expect(gates.matchedWritePath).toBeNull();
    expect(gates.ownershipProven).toBe(false);
    expect(gates.readEvidencePresent).toBe(false);
  });

  it("fails closed when requiredEvidenceKinds is empty", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const emptied = {
      ...state,
      writePaths: state.writePaths.map((p) =>
        p.writePathId === writePathId
          ? { ...p, requiredEvidenceKinds: [] }
          : p,
      ),
    };
    const gates = resolvePilotWriteGates({
      actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
      writePathId,
      channelId: "owned-site",
      assetId: "page-contact",
      operation: "submit_form_canary",
      mapping: emptied,
    });
    expect(gates.readEvidencePresent).toBe(false);
    expect(() => assertNonEmptyEvidenceKinds([])).toThrow(/non-empty/);
  });

  it("rejects unrelated resource evidence and mismatched CRM/form targets", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    let proven = proveFixturePilotWritePath(state, writePathId, now);
    // Swap CRM module to Contacts while form still targets Leads.
    proven = {
      ...proven,
      crmOwnership: proven.crmOwnership.map((c) =>
        c.crmOwnershipId === "crm-zoho-leads"
          ? { ...c, moduleId: "Contacts" }
          : c,
      ),
    };
    const mismatched = resolvePilotWriteGates({
      actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
      writePathId,
      channelId: "owned-site",
      assetId: "page-contact",
      operation: "submit_form_canary",
      mapping: proven,
    });
    expect(mismatched.ownershipProven).toBe(false);
    expect(mismatched.details.join(" ")).toMatch(/does not match form module/);

    // Form on wrong page asset.
    const wrongForm = {
      ...proveFixturePilotWritePath(state, writePathId, now),
    };
    wrongForm.forms = wrongForm.forms.map((f) =>
      f.formId === "form-contact"
        ? { ...f, pageAssetId: "page-other", siteId: "other-site" }
        : f,
    );
    const formGate = resolvePilotWriteGates({
      actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
      writePathId,
      channelId: "owned-site",
      assetId: "page-contact",
      operation: "submit_form_canary",
      mapping: wrongForm,
    });
    expect(formGate.ownershipProven).toBe(false);
    expect(formGate.details.join(" ")).toMatch(/does not belong to write target/);

    // Evidence for an unrelated resource id does not unlock the path.
    const withBogusEvidence = {
      ...state,
      writePaths: state.writePaths,
      bindings: state.bindings.map((b) => ({ ...b, ownershipProven: true })),
      crmOwnership: state.crmOwnership.map((c) => ({
        ...c,
        ownershipProven: true,
      })),
      readEvidence: state.writePaths[0]!.requiredEvidenceKinds.map(
        (kind, i) =>
          createReadEvidence({
            evidenceId: `bogus-${i}`,
            writePathId,
            evidenceKind: kind,
            resourceType: "binding",
            resourceId: "not-the-mapped-binding",
            operation: "bogus",
            summary: "unrelated",
            fixtureOnly: true,
            observedAtIso: now,
            adapterWiring: AdapterWiring.FIXTURE,
          }),
      ),
    };
    const bogusGate = resolvePilotWriteGates({
      actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
      writePathId,
      channelId: "owned-site",
      assetId: "page-contact",
      operation: "submit_form_canary",
      mapping: withBogusEvidence,
    });
    expect(bogusGate.readEvidencePresent).toBe(false);
  });

  it("refuses fixture proof for non-fixture CRM resources", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const liveCrm = {
      ...state,
      crmOwnership: state.crmOwnership.map((c) => ({
        ...c,
        environment: "production" as const,
        adapterWiring: AdapterWiring.FIXTURE,
      })),
    };
    expect(() => proveFixturePilotWritePath(liveCrm, writePathId, now)).toThrow(
      /not fixture-wired/,
    );
  });

  it("upserts fixture pilot without wiping existing mappings", () => {
    const existing = emptyProductionMappingState(now);
    existing.sites = ["keep-me"];
    existing.bindings = [
      {
        bindingId: "keep-binding",
        siteId: "keep-me",
        kind: "website",
        resourceRef: "https://example.local/keep",
        displayName: "Keep",
        identityLabel: null,
        connectionState: "NOT_CONFIGURED",
        writeReadiness: "NOT_AUTHORIZED",
        verificationState: "NOT_VERIFIED",
        ownershipProven: false,
        observedRevision: null,
        adapterWiring: AdapterWiring.NOT_WIRED,
        createdAtIso: now,
        updatedAtIso: now,
      },
    ];
    const first = upsertFixturePilotMapping(existing, now);
    expect(first.created).toBe(true);
    expect(first.state.sites).toContain("keep-me");
    expect(first.state.bindings.some((b) => b.bindingId === "keep-binding")).toBe(
      true,
    );
    expect(first.state.writePaths.some((p) => p.writePathId === first.writePathId)).toBe(
      true,
    );
    const second = upsertFixturePilotMapping(first.state, now);
    expect(second.created).toBe(false);
    expect(second.state.bindings).toHaveLength(first.state.bindings.length);
  });

  it("rejects unrecognized outcome evidence sources", () => {
    expect(() =>
      recordWritePathOutcome({
        outcomeId: "out-x",
        writePathId: "wp-1",
        operationId: "op-1",
        label: OutcomeLabel.SUCCESS,
        source: "unverified_model_claim" as never,
        summary: "bad",
        fixtureOnly: false,
        recordedAtIso: now,
      }),
    ).toThrow(/Unrecognized outcome evidence source/);
  });

  it("exposes labeled SUCCESS/FAILURE outcomes for a future learning-worker", () => {
    const { state, writePathId } = createFixturePilotMapping(now);
    const withOutcomes: typeof state = {
      ...state,
      writePathOutcomes: [
        recordWritePathOutcome({
          outcomeId: "out-1",
          writePathId,
          operationId: "op-ok",
          label: OutcomeLabel.SUCCESS,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          summary: "Verified fixture canary",
          fixtureOnly: false,
          recordedAtIso: now,
          featureHints: { code: "ok", stage: "crm" },
        }),
        recordWritePathOutcome({
          outcomeId: "out-2",
          writePathId,
          operationId: "op-fail",
          label: OutcomeLabel.FAILURE,
          source: OutcomeEvidenceSource.READ_BACK,
          summary: "CRM record missing",
          fixtureOnly: false,
          recordedAtIso: now,
        }),
        recordWritePathOutcome({
          outcomeId: "out-3",
          writePathId,
          operationId: "op-unk",
          label: OutcomeLabel.UNKNOWN,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          summary: "Accepted pending",
          fixtureOnly: false,
          recordedAtIso: now,
        }),
        recordWritePathOutcome({
          outcomeId: "out-4",
          writePathId,
          operationId: "op-fix",
          label: OutcomeLabel.SUCCESS,
          source: OutcomeEvidenceSource.FIXTURE,
          summary: "Fixture only",
          fixtureOnly: true,
          recordedAtIso: now,
        }),
      ],
    };
    const labels = listWritePathOutcomesForLearning(withOutcomes);
    expect(labels.map((r) => r.label)).toEqual([
      OutcomeLabel.SUCCESS,
      OutcomeLabel.FAILURE,
    ]);
    expect(
      listWritePathOutcomesForLearning(withOutcomes, { includeFixture: true }),
    ).toHaveLength(3);
  });
});
