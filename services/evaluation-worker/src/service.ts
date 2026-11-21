/**
 * M8 / NEXT-19 / AA-20 / AA-21 isolated evaluation service.
 * EVAL_ONLY Claude/Gemini fixture adjudication. No publish/CRM/customer-message.
 * Separate budget. ChatGPT Ads stays access-blocked. Live fleet NOT_WIRED.
 */

import { randomUUID } from "node:crypto";
import {
  EVAL_RELATED_CASE_IDS,
  EvalCapability,
  EvalProvider,
  EvalRunMode,
  EvalRunStatus,
  EvalToolClass,
  adjudicateGroundedEvalCase,
  createEvalConnection,
  evalChatGptAdsProbe,
  evaluateEvalToolAttempt,
  reserveEvalBudget,
  settleEvalBudget,
  type EvalCaseResult,
  type EvalConnectionRecord,
  type EvalProviderValue,
  type EvalRunModeValue,
  type EvalRunRecord,
  type EvalSuite,
  type EvalToolClassValue,
  type SupportLabelValue,
} from "@worksocial/domain";
import type {
  EvaluationStore,
  EvaluationStoreStatus,
} from "@worksocial/persistence";
import {
  EVAL_GOLDEN_SUITE_ID,
  EVAL_RESERVE_MINOR,
  buildFixtureEvalConnections,
  buildFixtureEvalSuite,
  fixtureCaseAnswer,
  fixtureEvalFactLabels,
} from "./fixtures.js";

const TOOL_MAP: Record<string, EvalToolClassValue> = {
  publish: EvalToolClass.PUBLISH,
  crm_write: EvalToolClass.CRM_WRITE,
  customer_message: EvalToolClass.CUSTOMER_MESSAGE,
  judge_answer: EvalToolClass.JUDGE_ANSWER,
  read_evidence: EvalToolClass.READ_EVIDENCE,
  compare_golden: EvalToolClass.COMPARE_GOLDEN,
  ads_mutation: EvalToolClass.ADS_MUTATION,
};

export type EvaluationService = {
  status(): Promise<
    EvaluationStoreStatus & {
      acceptanceCaseIds: readonly string[];
      principal: "evaluation-worker";
    }
  >;
  listConnections(limit?: number): Promise<EvalConnectionRecord[]>;
  listSuites(limit?: number): Promise<EvalSuite[]>;
  listRuns(limit?: number): Promise<EvalRunRecord[]>;
  seedFixtures(nowIso?: string): Promise<{
    connections: EvalConnectionRecord[];
    suite: EvalSuite;
  }>;
  connectProvider(input: {
    connectionId?: string;
    provider: EvalProviderValue;
    displayName?: string;
    nowIso?: string;
    /** Live connections are refused — always fixtureOnly. */
    fixtureOnly?: boolean;
  }): Promise<
    | { ok: true; connection: EvalConnectionRecord }
    | {
        ok: false;
        code: "LIVE_NOT_WIRED";
        reasons: string[];
      }
  >;
  runSuite(input: {
    suiteId?: string;
    provider?: EvalProviderValue;
    factLabels?: ReadonlyMap<string, SupportLabelValue>;
    nowIso?: string;
    reserveMinor?: number;
    /** Default fixture. Live mode returns LIVE_NOT_WIRED without network I/O. */
    mode?: EvalRunModeValue;
  }): Promise<
    | { ok: true; run: EvalRunRecord }
    | {
        ok: false;
        code: "SUITE_NOT_FOUND" | "BUDGET_EXHAUSTED" | "LIVE_NOT_WIRED";
        reasons: string[];
        run?: EvalRunRecord;
      }
  >;
  attemptTool(tool: string): ReturnType<typeof evaluateEvalToolAttempt>;
  chatgptAdsStatus(): ReturnType<typeof evalChatGptAdsProbe> & {
    wiring: "NOT_WIRED";
  };
};

export function createEvaluationService(
  store: EvaluationStore,
): EvaluationService {
  return {
    async status() {
      return {
        ...(await store.status()),
        acceptanceCaseIds: EVAL_RELATED_CASE_IDS,
        principal: "evaluation-worker",
      };
    },

    listConnections(limit) {
      return store.listConnections(limit);
    },

    listSuites(limit) {
      return store.listSuites(limit);
    },

    listRuns(limit) {
      return store.listRuns(limit);
    },

    async seedFixtures(nowIso) {
      const ts = nowIso ?? new Date().toISOString();
      const connections = buildFixtureEvalConnections(ts);
      for (const c of connections) await store.upsertConnection(c);
      const suite = buildFixtureEvalSuite(ts);
      await store.upsertSuite(suite);
      return { connections, suite };
    },

    async connectProvider(input) {
      if (input.fixtureOnly === false) {
        return {
          ok: false,
          code: "LIVE_NOT_WIRED",
          reasons: [
            "Live eval fleet NOT_WIRED — connections remain fixtureOnly EVAL_ONLY until verified transport/entitlement exist",
          ],
        };
      }
      const nowIso = input.nowIso ?? new Date().toISOString();
      const connection = createEvalConnection({
        connectionId: input.connectionId ?? `eval-conn-${randomUUID()}`,
        provider: input.provider,
        displayName:
          input.displayName ??
          `${input.provider === EvalProvider.GEMINI ? "Gemini" : "Claude"} EVAL_ONLY`,
        fixtureOnly: true,
        nowIso,
      });
      await store.upsertConnection(connection);
      return { ok: true, connection };
    },

    async runSuite(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const mode = input.mode ?? EvalRunMode.FIXTURE;
      const suiteId = input.suiteId ?? EVAL_GOLDEN_SUITE_ID;
      const provider = input.provider ?? EvalProvider.CLAUDE;

      if (mode === EvalRunMode.LIVE) {
        const blocked: EvalRunRecord = {
          runId: `eval-run-${randomUUID()}`,
          suiteId,
          provider,
          capability: EvalCapability.EVAL_ONLY,
          status: EvalRunStatus.FAILED,
          reservationId: null,
          reservedMinor: 0,
          settledMinor: 0,
          results: [],
          fixtureOnly: true,
          chatgptAdsDecision: evalChatGptAdsProbe(),
          createdAtIso: nowIso,
          completedAtIso: nowIso,
        };
        await store.addRun(blocked);
        return {
          ok: false,
          code: "LIVE_NOT_WIRED",
          reasons: [
            "Live Claude/Gemini eval fleet NOT_WIRED — fixture adjudication only; no provider network I/O",
          ],
          run: blocked,
        };
      }

      const state = await store.read();
      const suite = state.suites.find((s) => s.suiteId === suiteId) ?? null;
      if (!suite) {
        return {
          ok: false,
          code: "SUITE_NOT_FOUND",
          reasons: [`Unknown suite ${suiteId} — seed fixtures first`],
        };
      }

      const reservationId = `eval-res-${randomUUID()}`;
      const reserveMinor = input.reserveMinor ?? EVAL_RESERVE_MINOR;
      const reserved = reserveEvalBudget(
        state.budget,
        reservationId,
        reserveMinor,
      );
      if (!reserved.ok) {
        const failed: EvalRunRecord = {
          runId: `eval-run-${randomUUID()}`,
          suiteId,
          provider,
          capability: EvalCapability.EVAL_ONLY,
          status: EvalRunStatus.BUDGET_EXHAUSTED,
          reservationId: null,
          reservedMinor: 0,
          settledMinor: 0,
          results: [],
          fixtureOnly: true,
          chatgptAdsDecision: evalChatGptAdsProbe(),
          createdAtIso: nowIso,
          completedAtIso: nowIso,
        };
        await store.addRun(failed);
        return {
          ok: false,
          code: "BUDGET_EXHAUSTED",
          reasons: [
            `Eval budget exhausted (available ${reserved.availableMinor} minor) — separate from operational Claude`,
          ],
          run: failed,
        };
      }

      await store.update((s) => ({
        ...s,
        budget: reserved.account,
        updatedAtIso: nowIso,
      }));

      const factLabels = input.factLabels ?? fixtureEvalFactLabels();
      const results: EvalCaseResult[] = [];
      const blockedTools: EvalToolClassValue[] = [];

      for (const caseDef of suite.cases) {
        const answer = fixtureCaseAnswer(caseDef.caseId);
        const caseBlocked: EvalToolClassValue[] = [];
        for (const raw of answer.attemptedTools) {
          const tool = TOOL_MAP[raw] ?? EvalToolClass.PUBLISH;
          const gate = evaluateEvalToolAttempt(tool);
          if (!gate.allowed) {
            caseBlocked.push(tool);
            blockedTools.push(tool);
          }
        }
        const adjudication = adjudicateGroundedEvalCase({
          caseDef,
          citedFactIds: answer.citedFactIds,
          factLabels,
          groundingUsed: answer.groundingUsed,
        });
        results.push({
          caseId: caseDef.caseId,
          verdict: adjudication.verdict,
          citedFactIds: adjudication.citedFactIds,
          supportedCitedFactIds: adjudication.supportedCitedFactIds,
          groundingUsed: adjudication.groundingUsed,
          reasons: [
            ...adjudication.reasons,
            ...(caseBlocked.length > 0
              ? [`Blocked tools (no effect): ${caseBlocked.join(", ")}`]
              : []),
          ],
          toolAttemptsBlocked: caseBlocked,
        });
      }

      const actualMinor = Math.min(reserveMinor, 100 + results.length * 25);
      const settled = settleEvalBudget(
        (await store.read()).budget,
        reservationId,
        actualMinor,
      );
      if (settled.ok) {
        await store.update((s) => ({
          ...s,
          budget: settled.account,
          updatedAtIso: nowIso,
        }));
      }

      const run: EvalRunRecord = {
        runId: `eval-run-${randomUUID()}`,
        suiteId,
        provider,
        capability: EvalCapability.EVAL_ONLY,
        status: EvalRunStatus.COMPLETED,
        reservationId,
        reservedMinor: reserveMinor,
        settledMinor: settled.ok ? settled.actualMinor : 0,
        results,
        fixtureOnly: true,
        chatgptAdsDecision: evalChatGptAdsProbe(),
        createdAtIso: nowIso,
        completedAtIso: nowIso,
      };
      await store.addRun(run);

      return { ok: true, run };
    },

    attemptTool(tool) {
      const mapped = TOOL_MAP[tool] ?? EvalToolClass.PUBLISH;
      return evaluateEvalToolAttempt(mapped);
    },

    chatgptAdsStatus() {
      return {
        ...evalChatGptAdsProbe(),
        wiring: "NOT_WIRED",
      };
    },
  };
}
