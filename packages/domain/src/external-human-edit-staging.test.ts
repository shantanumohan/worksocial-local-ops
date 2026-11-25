import { describe, expect, it } from "vitest";
import {
  StagingConflictStatus,
  StagingVerifyOutcome,
  applyExternalHumanEdit,
  attemptBlindAgentOverwrite,
  createExternalEditStagingState,
  externalHumanEditLiveWiringStatus,
  independentVerifyStagingChange,
  normalizeClaimedVerified,
  normalizeLiveTemporalWiringRequest,
  normalizeOwnerAcknowledged,
  refuseClaimedVerifiedStaging,
  refuseSilentConflictClear,
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

    // STAGED_PENDING blind force still OVERWRITE_FORBIDDEN; page unchanged.
    const force = attemptBlindAgentOverwrite(state, { nowIso: t0 });
    expect(force.ok).toBe(false);
    if (force.ok) return;
    expect(force.code).toBe("OVERWRITE_FORBIDDEN");
    expect(force.state.page.contentDigest).toBe(digestFields(agentDesired));
    expect(force.state.change?.status).toBe(StagingConflictStatus.STAGED_PENDING);
    expect(force.liveTemporalWiring).toBe("NOT_WIRED");
  });

  it("refuses blank changeId, whitespace base, live stage, and non-literal live aliases", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    const state = createExternalEditStagingState({
      pageId: "page-pilot",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });

    const blank = stageAgentChangeAgainstBase(state, {
      changeId: "   ",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(blank.ok).toBe(false);
    if (blank.ok) return;
    expect(blank.code).toBe("CHANGE_ID_REQUIRED");
    expect(blank.liveTemporalWiring).toBe("NOT_WIRED");
    expect(blank.externalEffects).toBe("NONE");

    const padded = stageAgentChangeAgainstBase(state, {
      changeId: "chg-pad",
      expectedBaseRevision: " rev-1 ",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(padded.ok).toBe(true);
    if (!padded.ok) return;
    expect(padded.state.change?.expectedBaseRevision).toBe("rev-1");

    const blankExpected = stageAgentChangeAgainstBase(state, {
      changeId: "chg-blank-base",
      expectedBaseRevision: "   ",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(blankExpected.ok).toBe(false);
    if (blankExpected.ok) return;
    expect(blankExpected.code).toBe("BASE_REVISION_MISMATCH");
    expect(blankExpected.liveTemporalWiring).toBe("NOT_WIRED");

    const liveStage = stageAgentChangeAgainstBase(state, {
      changeId: "chg-live-stage",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
      requestLiveTemporalWiring: true,
    });
    expect(liveStage.ok).toBe(false);
    if (liveStage.ok) return;
    expect(liveStage.code).toBe("LIVE_TEMPORAL_WIRING_NOT_WIRED");
    expect(liveStage.state.change).toBeNull();

    const liveLiteral = stageAgentChangeAgainstBase(state, {
      changeId: "chg-live-str",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
      requestLiveTemporalWiring: "true",
    });
    expect(liveLiteral.ok).toBe(false);
    if (liveLiteral.ok) return;
    expect(liveLiteral.code).toBe("LIVE_TEMPORAL_WIRING_NOT_WIRED");

    expect(normalizeLiveTemporalWiringRequest(true)).toBe(true);
    expect(normalizeLiveTemporalWiringRequest("true")).toBe(true);
    expect(normalizeLiveTemporalWiringRequest(1)).toBe(false);
    expect(normalizeLiveTemporalWiringRequest("TRUE")).toBe(false);
    expect(normalizeLiveTemporalWiringRequest(" true ")).toBe(false);
    expect(normalizeLiveTemporalWiringRequest("yes")).toBe(false);
  });

  it("refuses silent conflict clear, live verify, NO_OPEN_CHANGE; multi-overwrite keeps human", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    const created = createExternalEditStagingState({
      pageId: "  page-pilot  ",
      fields: baseFields,
      revision: "  rev-1  ",
      nowIso: t0,
    });
    expect(created.page.pageId).toBe("page-pilot");
    expect(created.page.revision).toBe("rev-1");

    const noChange = attemptBlindAgentOverwrite(created, { nowIso: t0 });
    expect(noChange.ok).toBe(false);
    if (noChange.ok) return;
    expect(noChange.code).toBe("NO_OPEN_CHANGE");
    expect(noChange.state.agentOverwriteAttempts).toBe(1);
    expect(noChange.state.page.contentDigest).toBe(digestFields(baseFields));

    let state = created;
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

    const first = attemptBlindAgentOverwrite(state, {
      nowIso: "2026-11-22T18:01:00.000Z",
    });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.code).toBe("OVERWRITE_FORBIDDEN");
    state = first.state;
    expect(state.agentOverwriteAttempts).toBe(1);

    const second = attemptBlindAgentOverwrite(state, {
      nowIso: "2026-11-22T18:01:30.000Z",
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("OVERWRITE_FORBIDDEN");
    expect(second.state.agentOverwriteAttempts).toBe(2);
    expect(second.state.page.fields.title).toBe("Human edited title");
    expect(second.state.change?.status).toBe(
      StagingConflictStatus.CONFLICT_RETAINED,
    );

    const silent = refuseSilentConflictClear(second.state, {
      nowIso: "2026-11-22T18:02:00.000Z",
    });
    expect(silent.ok).toBe(false);
    expect(silent.code).toBe("SILENT_CLEAR_FORBIDDEN");
    expect(silent.state.change?.status).toBe(
      StagingConflictStatus.CONFLICT_RETAINED,
    );
    expect(silent.verifiedClaimed).toBe(false);

    const ack = refuseSilentConflictClear(second.state, {
      ownerAcknowledged: true,
      nowIso: "2026-11-22T18:02:00.000Z",
    });
    expect(ack.ok).toBe(true);
    expect(ack.code).toBe("OWNER_ACK_RECORDED_CONFLICT_KEPT");
    expect(ack.state.change?.status).toBe(StagingConflictStatus.CONFLICT_RETAINED);
    expect(ack.verifiedClaimed).toBe(false);

    const liveVerify = independentVerifyStagingChange(second.state, {
      nowIso: "2026-11-22T18:02:00.000Z",
      requestLiveTemporalWiring: true,
    });
    expect(liveVerify.matched).toBe(false);
    expect(liveVerify.verifiedClaimed).toBe(false);
    expect(liveVerify.refusedLiveTemporalWiring).toBe(true);
    expect(liveVerify.details.join(" ")).toMatch(/LIVE_TEMPORAL_WIRING_NOT_WIRED/);
    expect(liveVerify.liveTemporalWiring).toBe("NOT_WIRED");
  });

  it("identical human re-edit bumps revision; no-open-change edit invents no conflict; claimedVerified literal-only", () => {
    const t0 = "2026-11-22T18:00:00.000Z";
    let bare = createExternalEditStagingState({
      pageId: "page-bare",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    bare = applyExternalHumanEdit(bare, {
      fields: humanEdit,
      nowIso: "2026-11-22T18:00:30.000Z",
    });
    expect(bare.change).toBeNull();
    expect(bare.page.fields.title).toBe("Human edited title");
    expect(bare.externalEffects).toBe("NONE");
    expect(bare.liveTemporalWiring).toBe("NOT_WIRED");

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
    const revAfterFirst = state.change?.humanObservedRevision;
    const desired = state.change?.desiredDigest;
    state = applyExternalHumanEdit(state, {
      fields: humanEdit,
      nowIso: "2026-11-22T18:02:00.000Z",
    });
    expect(state.change?.status).toBe(StagingConflictStatus.CONFLICT_RETAINED);
    expect(state.change?.humanObservedDigest).toBe(digestFields(humanEdit));
    expect(state.change?.humanObservedRevision).not.toBe(revAfterFirst);
    expect(state.change?.desiredDigest).toBe(desired);
    expect(state.liveProviderSuccessClaimed).toBe(false);

    expect(normalizeClaimedVerified(true)).toBe(true);
    expect(normalizeClaimedVerified("true")).toBe(true);
    expect(normalizeClaimedVerified(1)).toBe(false);
    expect(normalizeClaimedVerified("TRUE")).toBe(false);
    expect(normalizeClaimedVerified(" true ")).toBe(false);
    const aliasClaim = refuseClaimedVerifiedStaging(state, {
      claimedVerified: "TRUE",
      nowIso: "2026-11-22T18:03:00.000Z",
    });
    expect(aliasClaim.code).toBe("CLAIMED_VERIFIED_REFUSED");
    expect(aliasClaim.reason).toMatch(/verifiedClaimed stays false/);
    const literalClaim = refuseClaimedVerifiedStaging(state, {
      claimedVerified: "true",
      nowIso: "2026-11-22T18:03:00.000Z",
    });
    expect(literalClaim.reason).toMatch(/CONFLICT_RETAINED cannot elevate/);

    expect(normalizeOwnerAcknowledged(true)).toBe(true);
    expect(normalizeOwnerAcknowledged("true")).toBe(true);
    expect(normalizeOwnerAcknowledged("TRUE")).toBe(false);
    expect(normalizeOwnerAcknowledged(1)).toBe(false);
    const aliasAck = refuseSilentConflictClear(state, {
      ownerAcknowledged: "TRUE",
      nowIso: "2026-11-22T18:04:00.000Z",
    });
    expect(aliasAck.ok).toBe(false);
    expect(aliasAck.code).toBe("SILENT_CLEAR_FORBIDDEN");

    const literalAck = refuseSilentConflictClear(state, {
      ownerAcknowledged: "true",
      nowIso: "2026-11-22T18:04:00.000Z",
    });
    expect(literalAck.ok).toBe(true);
    expect(literalAck.code).toBe("OWNER_ACK_RECORDED_CONFLICT_KEPT");
    expect(literalAck.state.change?.status).toBe(
      StagingConflictStatus.CONFLICT_RETAINED,
    );
    const afterAckOverwrite = attemptBlindAgentOverwrite(literalAck.state, {
      nowIso: "2026-11-22T18:04:30.000Z",
    });
    expect(afterAckOverwrite.ok).toBe(false);
    if (afterAckOverwrite.ok) return;
    expect(afterAckOverwrite.code).toBe("OVERWRITE_FORBIDDEN");
    expect(afterAckOverwrite.state.page.fields.title).toBe("Human edited title");
    expect(afterAckOverwrite.liveTemporalWiring).toBe("NOT_WIRED");
  });

  it("non-rev revision bumps with -next; MATCHED_PENDING_ONLY refuses claimedVerified", () => {
    const t0 = "2026-11-22T19:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-v1",
      fields: baseFields,
      revision: "v1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-v1",
      expectedBaseRevision: "v1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    expect(staged.state.page.revision).toBe("v1-next");
    state = staged.state;

    const matchedClaim = independentVerifyStagingChange(state, {
      nowIso: "2026-11-22T19:01:00.000Z",
      claimedVerified: true,
    });
    expect(matchedClaim.outcome).toBe(StagingVerifyOutcome.MATCHED_PENDING_ONLY);
    expect(matchedClaim.matched).toBe(true);
    expect(matchedClaim.verifiedClaimed).toBe(false);
    expect(matchedClaim.refusedClaimedVerified).toBe(true);
    expect(matchedClaim.details.join(" ")).toMatch(/CLAIMED_VERIFIED_REFUSED/);
    expect(matchedClaim.liveTemporalWiring).toBe("NOT_WIRED");
    expect(matchedClaim.externalEffects).toBe("NONE");

    const aliasClaim = independentVerifyStagingChange(state, {
      nowIso: "2026-11-22T19:02:00.000Z",
      claimedVerified: "TRUE",
    });
    expect(aliasClaim.outcome).toBe(StagingVerifyOutcome.MATCHED_PENDING_ONLY);
    expect(aliasClaim.verifiedClaimed).toBe(false);
    expect(aliasClaim.refusedClaimedVerified).toBeUndefined();
    expect(aliasClaim.details.join(" ")).not.toMatch(/CLAIMED_VERIFIED_REFUSED/);

    const postMatchOverwrite = attemptBlindAgentOverwrite(matchedClaim.state, {
      nowIso: "2026-11-22T19:03:00.000Z",
    });
    expect(postMatchOverwrite.ok).toBe(false);
    if (postMatchOverwrite.ok) return;
    expect(postMatchOverwrite.code).toBe("OVERWRITE_FORBIDDEN");
    expect(postMatchOverwrite.liveTemporalWiring).toBe("NOT_WIRED");
    expect(postMatchOverwrite.liveProviderSuccessClaimed).toBe(false);

    const noConflictClear = refuseSilentConflictClear(state, {
      ownerAcknowledged: true,
      nowIso: "2026-11-22T19:04:00.000Z",
    });
    expect(noConflictClear.ok).toBe(false);
    expect(noConflictClear.code).toBe("NO_CONFLICT");
  });

  it("whitespace pageId/revision throw; live verify literal true refuses; MATCHED then claimed refuse", () => {
    const t0 = "2026-11-22T21:00:00.000Z";
    expect(() =>
      createExternalEditStagingState({
        pageId: "   ",
        fields: baseFields,
        revision: "rev-1",
        nowIso: t0,
      }),
    ).toThrow(/pageId is required/);
    expect(() =>
      createExternalEditStagingState({
        pageId: "page-ws",
        fields: baseFields,
        revision: "   ",
        nowIso: t0,
      }),
    ).toThrow(/revision is required/);

    let state = createExternalEditStagingState({
      pageId: "page-n8",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-n8",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;

    const liveLiteralVerify = independentVerifyStagingChange(state, {
      nowIso: "2026-11-22T21:01:00.000Z",
      requestLiveTemporalWiring: "true",
    });
    expect(liveLiteralVerify.matched).toBe(false);
    expect(liveLiteralVerify.refusedLiveTemporalWiring).toBe(true);
    expect(liveLiteralVerify.verifiedClaimed).toBe(false);
    expect(liveLiteralVerify.details.join(" ")).toMatch(/LIVE_TEMPORAL_WIRING_NOT_WIRED/);
    expect(liveLiteralVerify.liveTemporalWiring).toBe("NOT_WIRED");

    const aliasLiveVerify = independentVerifyStagingChange(state, {
      nowIso: "2026-11-22T21:02:00.000Z",
      requestLiveTemporalWiring: "TRUE",
    });
    expect(aliasLiveVerify.refusedLiveTemporalWiring).toBeUndefined();
    expect(aliasLiveVerify.outcome).toBe(StagingVerifyOutcome.MATCHED_PENDING_ONLY);
    expect(aliasLiveVerify.verifiedClaimed).toBe(false);

    const matched = independentVerifyStagingChange(state, {
      nowIso: "2026-11-22T21:03:00.000Z",
    });
    expect(matched.outcome).toBe(StagingVerifyOutcome.MATCHED_PENDING_ONLY);
    const claimedAfterMatch = refuseClaimedVerifiedStaging(matched.state, {
      claimedVerified: true,
      nowIso: "2026-11-22T21:04:00.000Z",
    });
    expect(claimedAfterMatch.code).toBe("CLAIMED_VERIFIED_REFUSED");
    expect(claimedAfterMatch.verifiedClaimed).toBe(false);
    expect(claimedAfterMatch.reason).toMatch(/fixture ACCEPTED only, not VERIFIED/);
    expect(claimedAfterMatch.liveTemporalWiring).toBe("NOT_WIRED");
    expect(claimedAfterMatch.externalEffects).toBe("NONE");
  });

  it("convergent human edit retains CONFLICT; verify refuses claimedVerified", () => {
    const t0 = "2026-11-22T20:00:00.000Z";
    let state = createExternalEditStagingState({
      pageId: "page-conv",
      fields: baseFields,
      revision: "rev-1",
      nowIso: t0,
    });
    const staged = stageAgentChangeAgainstBase(state, {
      changeId: "chg-conv",
      expectedBaseRevision: "rev-1",
      desiredFields: agentDesired,
      nowIso: t0,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    state = staged.state;
    state = applyExternalHumanEdit(state, {
      fields: agentDesired,
      nowIso: "2026-11-22T20:01:00.000Z",
    });
    expect(state.change?.status).toBe(StagingConflictStatus.CONFLICT_RETAINED);
    expect(state.change?.humanObservedDigest).toBe(digestFields(agentDesired));
    expect(state.change?.desiredDigest).toBe(digestFields(agentDesired));
    expect(state.change?.recoveryNote).toMatch(/convergent digest still CONFLICT_RETAINED/);
    expect(state.liveProviderSuccessClaimed).toBe(false);
    expect(state.externalEffects).toBe("NONE");

    const verify = independentVerifyStagingChange(state, {
      nowIso: "2026-11-22T20:02:00.000Z",
      claimedVerified: true,
    });
    expect(verify.outcome).toBe(StagingVerifyOutcome.CONFLICT_RETAINED);
    expect(verify.matched).toBe(false);
    expect(verify.verifiedClaimed).toBe(false);
    expect(verify.refusedClaimedVerified).toBe(true);
    expect(verify.details.join(" ")).toMatch(/CLAIMED_VERIFIED_REFUSED/);
    expect(verify.details.join(" ")).not.toMatch(/MATCHED_PENDING_ONLY/);
    expect(verify.liveTemporalWiring).toBe("NOT_WIRED");
  });
});
