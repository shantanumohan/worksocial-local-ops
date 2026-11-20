/**
 * File-backed lead capture journey store (M5 / NEXT-16).
 * Schema companion: database/migrations/017_lead_capture.sql.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyLeadCaptureState,
  type CommerceLeadRow,
  type LeadCaptureJourney,
  type LeadCaptureState,
} from "@worksocial/domain";

export type LeadCaptureStore = {
  readonly stateDir: string;
  read(): LeadCaptureState;
  write(state: LeadCaptureState): void;
  update(
    mutator: (current: LeadCaptureState) => LeadCaptureState,
  ): LeadCaptureState;
  upsertJourney(journey: LeadCaptureJourney): LeadCaptureState;
  addCleanupEvent(event: LeadCaptureState["cleanupEvents"][number]): LeadCaptureState;
  addCommerceLead(lead: CommerceLeadRow): LeadCaptureState;
  status(): {
    journeyCount: number;
    cleanupEventCount: number;
    commerceLeadCount: number;
    liveZohoWiring: "NOT_WIRED";
    playwrightWiring: LeadCaptureState["playwrightWiring"];
    temporalWiring: "NOT_WIRED";
    r1CompleteClaim: false;
    honestNote: string;
  };
};

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function defaultLeadCaptureStateDir(baseDir: string): string {
  return join(baseDir, "lead-capture");
}

export function createFileLeadCaptureStore(stateDir: string): LeadCaptureStore {
  const dir = join(stateDir, "lead-capture");
  const statePath = join(dir, "lead-capture-state.json");

  const read = (): LeadCaptureState => {
    const existing = readJsonFile<LeadCaptureState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyLeadCaptureState(new Date().toISOString());
    }
    return {
      ...existing,
      journeys: existing.journeys ?? [],
      cleanupEvents: existing.cleanupEvents ?? [],
      commerceLeads: existing.commerceLeads ?? [],
      liveZohoWiring: "NOT_WIRED",
      temporalWiring: "NOT_WIRED",
      r1CompleteClaim: false,
      playwrightWiring: existing.playwrightWiring ?? "FIXTURE",
    };
  };

  const write = (state: LeadCaptureState): void => {
    atomicWriteJson(statePath, state);
  };

  const update = (
    mutator: (current: LeadCaptureState) => LeadCaptureState,
  ): LeadCaptureState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir: dir,
    read,
    write,
    update,
    upsertJourney(journey) {
      return update((current) => {
        const idx = current.journeys.findIndex(
          (j) => j.journeyId === journey.journeyId,
        );
        const journeys =
          idx >= 0
            ? current.journeys.map((j, i) => (i === idx ? journey : j))
            : [...current.journeys, journey];
        return {
          ...current,
          journeys,
          updatedAtIso: journey.updatedAtIso,
        };
      });
    },
    addCleanupEvent(event) {
      return update((current) => ({
        ...current,
        cleanupEvents: [...current.cleanupEvents, event],
        updatedAtIso: event.cleanedAtIso,
      }));
    },
    addCommerceLead(lead) {
      return update((current) => {
        if (lead.synthetic && lead.countedInCommerce) {
          throw new Error(
            "Synthetic canary leads must not be marked countedInCommerce",
          );
        }
        return {
          ...current,
          commerceLeads: [...current.commerceLeads, lead],
          updatedAtIso: new Date().toISOString(),
        };
      });
    },
    status() {
      const state = read();
      return {
        journeyCount: state.journeys.length,
        cleanupEventCount: state.cleanupEvents.length,
        commerceLeadCount: state.commerceLeads.length,
        liveZohoWiring: "NOT_WIRED",
        playwrightWiring: state.playwrightWiring,
        temporalWiring: "NOT_WIRED",
        r1CompleteClaim: false,
        honestNote:
          "Fixture lead-capture journeys only. Live Zoho NOT_WIRED. Temporal NOT_WIRED. Not R1-complete.",
      };
    },
  };
}
