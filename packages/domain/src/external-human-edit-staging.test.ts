import { describe, expect, it } from "vitest";
import {
  StagingConflictStatus,
  StagingVerifyOutcome,
  applyExternalHumanEdit,
  attemptBlindAgentOverwrite,
  createExternalEditStagingState,
  independentVerifyStagingChange,
  stageAgentChangeAgainstBase,
} from "./external-human-edit-staging.js";
import { digestFields } from "./owner-staging.js";

const baseFields = {
  title: "Pilot page",
  metaDescription: "Original meta",
  h1: "Welcome",
  bodyExcerpt: "Original body",
};

const agentDesired = {
  title: "Agent staged title",
  metaDescription: "Agent meta",
  h1: "Agent H1",
  bodyExcerpt: "Agent staged body",
};

const humanEdit = {
  title: "Human edited title",
  metaDescription: "Human meta",
  h1: "Human H1",
  bodyExcerpt: "Human body during staging",
};

describe("external human edit during staging (T-X025)", () => {
  it("stages against matching base; human edit retains CONFLICT; overwrite forbidden", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    expect(state.page.contentDigest).toBe(digestFields(baseFields));
    expect(state.externalEffects).toBe("NONE");

    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-1",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;
    expect(state.change?.status).toBe(StagingConflictStatus.STAGED_PENDING);
    expect(state.page.contentDigest).toBe(digestFields(agentDesired));
    expect(state.change?.expectedBaseRevision).toBe("rev-1");

    const t1 = "2026-11-22T18:01:00.000Z";
    state = applyExternalHumanEdit(state, { fields: humanEdit, nowIso: t1 });
    expect(state.change?.status).toBe(StagingConflictStatus.CONFLICT_RETAINED);
    expect(state.change?.humanObservedDigest).toBe(digestFields(humanEdit));
    expect(state.change?.humanObservedRevision).toBe(state.page.revision);
    expect(state.page.fields.title).toBe("Human edited title");
    expect(state.change?.desiredDigest).toBe(digestFields(agentDesired));

    const overwrite = attemptBlindAgentOverwrite(state, { nowIso: t1 });
    expect(overwrite.ok).toBe(false);
    if (overwrite.ok) return;
    expect(overwrite.code).toBe("OVERWRITE_FORBIDDEN");
    state = overwrite.state;
    expect(state.change?.status).toBe(StagingConflictStatus.CONFLICT_RETAINED);
    expect(state.page.fields.title).toBe("Human edited title");
    expect(state.agentOverwriteAttempts).toBe(1);
    expect(state.externalEffects).toBe("NONE");

    const verify = independentVerifyStagingChange(state, { nowIso: t1 });
    expect(verify.matched).toBe(false);
    expect(verify.verifiedClaimed).toBe(false);
    expect(verify.outcome).toBe(StagingVerifyOutcome.CONFLICT_RETAINED);
    expect(verify.state.change?.status).toBe(
      StagingConflictStatus.CONFLICT_RETAINED,
    );
  });

  it("refuses stage when base revision already drifted (pre-stage human edit)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    state = applyExternalHumanEdit(state, {
      fields: humanEdit,
      nowIso: "2026-11-22T18:00:30.000Z",
    });
    expect(state.page.revision).not.toBe("rev-1");

    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-stale",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: "2026-11-22T18:01:00.000Z",
    });
    expect(staged.ok).toBe(false);
    if (staged.ok) return;
    expect(staged.code).toBe("BASE_REVISION_MISMATCH");
    expect(staged.state.page.fields.title).toBe("Human edited title");
  });

  it("positive control: without human edit, independent verify matches pending only", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-ok",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;

    const verify = independentVerifyStagingChange(state, { nowIso: t0 });
    expect(verify.matched).toBe(true);
    expect(verify.verifiedClaimed).toBe(false);
    expect(verify.outcome).toBe(StagingVerifyOutcome.MATCHED_PENDING_ONLY);
    expect(verify.state.change?.status).toBe(StagingConflictStatus.STAGED_PENDING);
  });
});
