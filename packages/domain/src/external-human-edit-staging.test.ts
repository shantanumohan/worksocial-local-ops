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

  it("repeat blind overwrite stays OVERWRITE_FORBIDDEN; verify never VERIFIED (L20)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-l20",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;

    const t1 = "2026-11-22T18:01:00.000Z";
    state = applyExternalHumanEdit(state, { fields: humanEdit, nowIso: t1 });
    expect(state.change?.status).toBe(StagingConflictStatus.CONFLICT_RETAINED);

    const overwrite1 = attemptBlindAgentOverwrite(state, { nowIso: t1 });
    expect(overwrite1.ok).toBe(false);
    state = overwrite1.state;
    expect(state.agentOverwriteAttempts).toBe(1);

    const t2 = "2026-11-22T18:02:00.000Z";
    const overwrite2 = attemptBlindAgentOverwrite(state, { nowIso: t2 });
    expect(overwrite2.ok).toBe(false);
    if (overwrite2.ok) return;
    expect(overwrite2.code).toBe("OVERWRITE_FORBIDDEN");
    state = overwrite2.state;
    expect(state.agentOverwriteAttempts).toBe(2);
    expect(state.page.fields.title).toBe("Human edited title");

    const verify = independentVerifyStagingChange(state, { nowIso: t2 });
    expect(verify.verifiedClaimed).toBe(false);
    expect(verify.outcome).toBe(StagingVerifyOutcome.CONFLICT_RETAINED);
    expect(verify.state.externalEffects).toBe("NONE");
  });

  it("refuses second stage while change is open (L21)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-l21",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;

    const restage = stageAgentChangeAgainstBase(state, {
      changeId: "chg-l21-b",
      expectedBaseRevision: state.page.revision,
      desiredFields: {
        ...agentDesired,
        title: "Another agent title",
      },
      nowIso: "2026-11-22T18:00:30.000Z",
    });
    expect(restage.ok).toBe(false);
    if (restage.ok) return;
    expect(restage.code).toBe("CHANGE_ALREADY_OPEN");
    expect(restage.state.change?.changeId).toBe("chg-l21");
    expect(restage.state.externalEffects).toBe("NONE");
  });

  it("blind overwrite without open change is NO_OPEN_CHANGE (L22)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    const state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    expect(state.change).toBeNull();

    const overwrite = attemptBlindAgentOverwrite(state, { nowIso: t0 });
    expect(overwrite.ok).toBe(false);
    if (overwrite.ok) return;
    expect(overwrite.code).toBe("NO_OPEN_CHANGE");
    expect(overwrite.state.agentOverwriteAttempts).toBe(1);
    expect(overwrite.state.page.fields.title).toBe("Pilot page");
    expect(overwrite.state.externalEffects).toBe("NONE");
  });

  it("independent verify without staged change stays MISMATCH (L23)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    const state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    expect(state.change).toBeNull();

    const verify = independentVerifyStagingChange(state, { nowIso: t0 });
    expect(verify.matched).toBe(false);
    expect(verify.verifiedClaimed).toBe(false);
    expect(verify.outcome).toBe(StagingVerifyOutcome.MISMATCH);
    expect(verify.details.join(" ")).toMatch(/No staged change/i);
    expect(verify.state.externalEffects).toBe("NONE");
  });

  it("stage with wrong expected base revision is BASE_REVISION_MISMATCH (L24)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    const state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });

    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-l24",
      expectedBaseRevision: "rev-stale",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(false);
    if (staged.ok) return;
    expect(staged.code).toBe("BASE_REVISION_MISMATCH");
    expect(staged.state.change).toBeNull();
    expect(staged.state.page.fields.title).toBe("Pilot page");
    expect(staged.state.externalEffects).toBe("NONE");
  });

  it("verify on STAGED_PENDING match is MATCHED_PENDING_ONLY not VERIFIED (L25)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-l25",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;
    expect(state.change?.status).toBe(StagingConflictStatus.STAGED_PENDING);

    const verify = independentVerifyStagingChange(state, { nowIso: t0 });
    expect(verify.matched).toBe(true);
    expect(verify.verifiedClaimed).toBe(false);
    expect(verify.outcome).toBe(StagingVerifyOutcome.MATCHED_PENDING_ONLY);
    expect(verify.state.change?.status).toBe(StagingConflictStatus.STAGED_PENDING);
    expect(verify.state.externalEffects).toBe("NONE");
  });

  it("blind overwrite on STAGED_PENDING still OVERWRITE_FORBIDDEN (L26)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-l26",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;
    expect(state.change?.status).toBe(StagingConflictStatus.STAGED_PENDING);

    const overwrite = attemptBlindAgentOverwrite(state, { nowIso: t0 });
    expect(overwrite.ok).toBe(false);
    if (overwrite.ok) return;
    expect(overwrite.code).toBe("OVERWRITE_FORBIDDEN");
    expect(overwrite.reason).toMatch(/independent verify/i);
    expect(overwrite.state.change?.status).toBe(StagingConflictStatus.STAGED_PENDING);
    expect(overwrite.state.agentOverwriteAttempts).toBe(1);
    expect(overwrite.state.externalEffects).toBe("NONE");
  });

  it("human edit without staged change updates page only (L27)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    const state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    expect(state.change).toBeNull();

    const t1 = "2026-11-22T18:01:00.000Z";
    const next = applyExternalHumanEdit(state, { fields: humanEdit, nowIso: t1 });
    expect(next.change).toBeNull();
    expect(next.page.fields.title).toBe("Human edited title");
    expect(next.page.contentDigest).toBe(digestFields(humanEdit));
    expect(next.page.revision).not.toBe("rev-1");
    expect(next.externalEffects).toBe("NONE");
  });

  it("second human edit during CONFLICT_RETAINED stays retained (L28)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-l28",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;

    const t1 = "2026-11-22T18:01:00.000Z";
    state = applyExternalHumanEdit(state, { fields: humanEdit, nowIso: t1 });
    expect(state.change?.status).toBe(StagingConflictStatus.CONFLICT_RETAINED);
    const digestAfterFirst = state.page.contentDigest;

    const humanEdit2 = {
      ...humanEdit,
      title: "Human second pass title",
    };
    const t2 = "2026-11-22T18:02:00.000Z";
    state = applyExternalHumanEdit(state, { fields: humanEdit2, nowIso: t2 });
    expect(state.change?.status).toBe(StagingConflictStatus.CONFLICT_RETAINED);
    expect(state.page.fields.title).toBe("Human second pass title");
    expect(state.page.contentDigest).not.toBe(digestAfterFirst);
    expect(state.change?.humanObservedDigest).toBe(digestFields(humanEdit2));
    expect(state.externalEffects).toBe("NONE");
  });

  it("independent verify on conflict sets recoveryNote not VERIFIED (L29)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-l29",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;

    const t1 = "2026-11-22T18:01:00.000Z";
    state = applyExternalHumanEdit(state, { fields: humanEdit, nowIso: t1 });
    expect(state.change?.recoveryNote).toMatch(/conflict retained/i);

    const verify = independentVerifyStagingChange(state, { nowIso: t1 });
    expect(verify.outcome).toBe(StagingVerifyOutcome.CONFLICT_RETAINED);
    expect(verify.verifiedClaimed).toBe(false);
    expect(verify.state.change?.recoveryNote).toMatch(
      /not VERIFIED|Conflict retained/i,
    );
    expect(verify.state.externalEffects).toBe("NONE");
  });

  it("fresh staging state has no change and zero overwrite attempts (L30)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    const state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    expect(state.change).toBeNull();
    expect(state.agentOverwriteAttempts).toBe(0);
    expect(state.page.contentDigest).toBe(digestFields(baseFields));
    expect(state.externalEffects).toBe("NONE");
  });

  it("stage records changeId and desiredDigest on STAGED_PENDING (L31)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    const state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-l31",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    expect(staged.state.change?.changeId).toBe("chg-l31");
    expect(staged.state.change?.desiredDigest).toBe(digestFields(agentDesired));
    expect(staged.state.change?.pageId).toBe("page-pilot");
    expect(staged.state.externalEffects).toBe("NONE");
  });

  it("successful stage bumps page revision from base (L32)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    const state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-l32",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    expect(staged.state.page.revision).not.toBe("rev-1");
    expect(staged.state.change?.expectedBaseRevision).toBe("rev-1");
    expect(staged.state.externalEffects).toBe("NONE");
  });

  it("human edit during STAGED_PENDING sets humanObservedRevision (L33)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-l33",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;
    const preHumanRevision = state.page.revision;

    const t1 = "2026-11-22T18:01:00.000Z";
    state = applyExternalHumanEdit(state, { fields: humanEdit, nowIso: t1 });
    expect(state.change?.status).toBe(StagingConflictStatus.CONFLICT_RETAINED);
    expect(state.change?.humanObservedRevision).toBe(state.page.revision);
    expect(state.page.revision).not.toBe(preHumanRevision);
    expect(state.externalEffects).toBe("NONE");
  });

  it("blind overwrite on conflict leaves human fields unchanged (L34)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-l34",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;

    const t1 = "2026-11-22T18:01:00.000Z";
    state = applyExternalHumanEdit(state, { fields: humanEdit, nowIso: t1 });
    expect(state.page.fields.title).toBe("Human edited title");

    const overwrite = attemptBlindAgentOverwrite(state, { nowIso: t1 });
    expect(overwrite.ok).toBe(false);
    if (overwrite.ok) return;
    expect(overwrite.state.page.fields.title).toBe("Human edited title");
    expect(overwrite.state.page.fields.title).not.toBe(agentDesired.title);
    expect(overwrite.state.agentOverwriteAttempts).toBe(1);
    expect(overwrite.state.externalEffects).toBe("NONE");
  });

  it("second blind overwrite on conflict increments attempts only (L35)", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-l35",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;

    const t1 = "2026-11-22T18:01:00.000Z";
    state = applyExternalHumanEdit(state, { fields: humanEdit, nowIso: t1 });
    const humanDigest = state.page.contentDigest;

    const first = attemptBlindAgentOverwrite(state, { nowIso: t1 });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.state.agentOverwriteAttempts).toBe(1);

    const t2 = "2026-11-22T18:02:00.000Z";
    const second = attemptBlindAgentOverwrite(first.state, { nowIso: t2 });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("OVERWRITE_FORBIDDEN");
    expect(second.state.agentOverwriteAttempts).toBe(2);
    expect(second.state.page.fields.title).toBe("Human edited title");
    expect(second.state.page.contentDigest).toBe(humanDigest);
    expect(second.state.change?.status).toBe(StagingConflictStatus.CONFLICT_RETAINED);
    expect(second.state.externalEffects).toBe("NONE");
  });
});
