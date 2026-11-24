import { describe, expect, it } from "vitest";
import {
  StagingConflictStatus,
  StagingVerifyOutcome,
  applyExternalHumanEdit,
  attemptBlindAgentOverwrite,
  createExternalEditStagingState,
  externalHumanEditLiveWiringStatus,
  independentVerifyStagingChange,
  refuseClaimedVerifiedStaging,
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
    expect(state.liveTemporalWiring).toBe("NOT_WIRED");
    expect(state.liveProviderSuccessClaimed).toBe(false);
    expect(externalHumanEditLiveWiringStatus()).toBe("NOT_WIRED");

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
    expect(state.liveTemporalWiring).toBe("NOT_WIRED");
    expect(overwrite.liveTemporalWiring).toBe("NOT_WIRED");
    expect(overwrite.liveProviderSuccessClaimed).toBe(false);

    const verify = independentVerifyStagingChange(state, { nowIso: t1 });
    expect(verify.matched).toBe(false);
    expect(verify.verifiedClaimed).toBe(false);
    expect(verify.liveTemporalWiring).toBe("NOT_WIRED");
    expect(verify.outcome).toBe(StagingVerifyOutcome.CONFLICT_RETAINED);
    expect(verify.state.change?.status).toBe(
      StagingConflictStatus.CONFLICT_RETAINED,
    );

    const claimed = refuseClaimedVerifiedStaging(state, {
      claimedVerified: true,
      nowIso: t1,
    });
    expect(claimed.ok).toBe(false);
    expect(claimed.code).toBe("CLAIMED_VERIFIED_REFUSED");
    expect(claimed.verifiedClaimed).toBe(false);
    expect(claimed.liveTemporalWiring).toBe("NOT_WIRED");
  });

  it("refuses live Temporal wiring request on blind overwrite", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-live",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;

    const live = attemptBlindAgentOverwrite(state, {
      nowIso: t0,
      requestLiveTemporalWiring: true,
    });
    expect(live.ok).toBe(false);
    if (live.ok) return;
    expect(live.code).toBe("LIVE_TEMPORAL_WIRING_NOT_WIRED");
    expect(live.liveTemporalWiring).toBe("NOT_WIRED");
    expect(live.externalEffects).toBe("NONE");
    expect(live.state.page.contentDigest).toBe(digestFields(agentDesired));
  });

  it("second human edit while CONFLICT_RETAINED updates observations; restage refused", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-1",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;

    state = applyExternalHumanEdit(state, {
      fields: humanEdit,
      nowIso: "2026-11-22T18:01:00.000Z",
    });
    expect(state.change?.status).toBe(StagingConflictStatus.CONFLICT_RETAINED);
    const firstHumanRev = state.change?.humanObservedRevision;

    const secondHuman = {
      title: "Second human edit",
      metaDescription: "Human meta 2",
      h1: "Human H1 2",
      bodyExcerpt: "Second human body",
    };
    state = applyExternalHumanEdit(state, {
      fields: secondHuman,
      nowIso: "2026-11-22T18:02:00.000Z",
    });
    expect(state.change?.status).toBe(StagingConflictStatus.CONFLICT_RETAINED);
    expect(state.change?.humanObservedDigest).toBe(digestFields(secondHuman));
    expect(state.change?.humanObservedRevision).not.toBe(firstHumanRev);
    expect(state.page.fields.title).toBe("Second human edit");
    expect(state.change?.desiredDigest).toBe(digestFields(agentDesired));
    expect(state.liveTemporalWiring).toBe("NOT_WIRED");

    const restage = stageAgentChangeAgainstBase(state, {
      changeId: "chg-2",
      expectedBaseRevision: state.page.revision,
      desiredFields: agentDesired,
      nowIso: "2026-11-22T18:03:00.000Z",
    });
    expect(restage.ok).toBe(false);
    if (restage.ok) return;
    expect(restage.code).toBe("CHANGE_ALREADY_OPEN");
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
    expect(verify.liveTemporalWiring).toBe("NOT_WIRED");
    expect(verify.outcome).toBe(StagingVerifyOutcome.MATCHED_PENDING_ONLY);
    expect(verify.state.change?.status).toBe(StagingConflictStatus.STAGED_PENDING);

    const claimed = refuseClaimedVerifiedStaging(state, {
      claimedVerified: true,
      nowIso: t0,
    });
    expect(claimed.code).toBe("CLAIMED_VERIFIED_REFUSED");
    expect(claimed.verifiedClaimed).toBe(false);
    expect(claimed.reason).toMatch(/ACCEPTED only|not VERIFIED/i);
  });
});
