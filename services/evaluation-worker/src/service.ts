/**
 * M8 / NEXT-19 isolated evaluation worker.
 * EVAL_ONLY Claude/Gemini fixture adjudication. No publish/CRM/customer-message.
 * Separate budget. ChatGPT Ads stays access-blocked. Live fleet NOT_WIRED.
 */

import { randomUUID } from "node:crypto";
import {
  EVAL_RELATED_CASE_IDS,
  EvalCapability,
  EvalProvider,
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
  type EvalRunRecord,
  type EvalSuite,
  type EvalToolClassValue,
  type SupportLabelValue,
} from "@worksocial/domain";
import type { EvaluationStore } from "@worksocial/persistence";
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
  status(): ReturnType<EvaluationStore["status"]> & {
    acceptanceCaseIds: readonly string[];
    principal: "evaluation-worker";
  };
  listConnections(limit?: number): EvalConnectionRecord[];
  listSuites(limit?: number): EvalSuite[];
  listRuns(limit?: number): EvalRunRecord[];
  seedFixtures(nowIso?: string): {
    connections: EvalConnectionRecord[];
    suite: EvalSuite;
  };
  connectProvider(input: {
    connectionId?: string;
    provider: EvalProviderValue;
    displayName?: string;
    nowIso?: string;
  }): EvalConnectionRecord;
  runSuite(input: {
    suiteId?: string;
    provider?: EvalProviderValue;
    factLabels?: ReadonlyMap<string, SupportLabelValue>;
    nowIso?: string;
    reserveMinor?: number;
  }):
    | { ok: true; run: EvalRunRecord }
    | {
        ok: false;
        code: "SUITE_NOT_FOUND" | "BUDGET_EXHAUSTED" | "LIVE_NOT_WIRED";
        reasons: string[];
        run?: EvalRunRecord;
      };
  attemptTool(tool: string): ReturnType<typeof evaluateEvalToolAttempt>;
  chatgptAdsStatus(): ReturnType<typeof evalChatGptAdsProbe> & {
    wiring: "NOT_WIRED";
  };
};

export function createEvaluationService(
  store: EvaluationStore,
): EvaluationService {
  return {
    status() {
      return {
        ...store.status(),
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

    seedFixtures(nowIso) {
      const ts = nowIso ?? new Date().toISOString();
      const connections = buildFixtureEvalConnections(ts);
      for (const c of connections) store.upsertConnection(c);
      const suite = buildFixtureEvalSuite(ts);
      store.upsertSuite(suite);
      return { connections, suite };
    },

    connectProvider(input) {
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
      store.upsertConnection(connection);
      return connection;
    },

    runSuite(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const suiteId = input.suiteId ?? EVAL_GOLDEN_SUITE_ID;
      const provider = input.provider ?? EvalProvider.CLAUDE;
      const state = store.read();
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
        store.addRun(failed);
        return {
          ok: false,
          code: "BUDGET_EXHAUSTED",
          reasons: [
            `Eval budget exhausted (available ${reserved.availableMinor} minor) — separate from operational Claude`,
          ],
          run: failed,
        };
      }

      store.update((s) => ({
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
        store.read().budget,
        reservationId,
        actualMinor,
      );
      if (settled.ok) {
        store.update((s) => ({
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
      store.addRun(run);

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
