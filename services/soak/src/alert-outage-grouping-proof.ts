/**
 * Fixture proof for T-X068 — Thirty alerts one outage → grouped incident.
 * External effects: NONE. Live wiring NOT_WIRED.
 * Hillclimb: whitespace outageKey collapse, chronological alertIds,
 * uniqueSources, max severity, three-key separation.
 */

import { randomUUID } from "node:crypto";
import {
  AlertSeverity,
  SoakProofKind,
  createProbeAlert,
  groupAlertsIntoIncidents,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X068 fixture ACCEPTED.
 */
export function proofThirtyAlertsOneOutageGrouped(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const baseMs = Date.parse(nowIso);

  const primaryOutage = "host:local-1";
  const secondaryOutage = "provider:fixture-crm";

  const primaryAlerts = Array.from({ length: 30 }, (_, i) =>
    createProbeAlert({
      alertId: `alert-primary-${String(i + 1).padStart(2, "0")}`,
      // Alternate padded keys — must still collapse to one incident.
      outageKey: i % 2 === 0 ? primaryOutage : `  ${primaryOutage} `,
      source: `probe-role-A19-${(i % 6) + 1}`,
      raisedAtIso: new Date(baseMs + i * 500).toISOString(),
      severity: i === 0 ? AlertSeverity.P0 : AlertSeverity.P1,
      message: `Fixture uptime/TLS probe failure ${i + 1}`,
    }),
  );

  const secondaryAlerts = [
    createProbeAlert({
      alertId: "alert-secondary-01",
      outageKey: secondaryOutage,
      source: "probe-crm-canary",
      raisedAtIso: new Date(baseMs + 20_000).toISOString(),
      severity: AlertSeverity.P2,
      message: "Fixture CRM canary timeout",
    }),
  ];

  const tertiaryOutage = "capability:gsc-fetch";
  const tertiaryAlerts = [
    createProbeAlert({
      alertId: "alert-tertiary-01",
      outageKey: tertiaryOutage,
      source: "probe-gsc",
      raisedAtIso: new Date(baseMs + 25_000).toISOString(),
      severity: AlertSeverity.P3,
      message: "Fixture GSC fetch timeout",
    }),
  ];

  // Deliberately shuffle primary alerts so chronological alertIds cannot
  // pass via insertion-order preservation alone (Codex P2).
  const shuffledPrimary = [
    ...primaryAlerts.slice(10),
    ...primaryAlerts.slice(0, 5).reverse(),
    ...primaryAlerts.slice(5, 10),
  ];
  const allAlerts = [
    ...shuffledPrimary,
    ...secondaryAlerts,
    ...tertiaryAlerts,
  ];
  const incidents = groupAlertsIntoIncidents({
    alerts: allAlerts,
    incidentIdForOutageKey: (k) => `inc-${k.replace(/[^a-z0-9-]/gi, "-")}`,
  });

  if (incidents.length === 3) {
    details.push(
      `32 alerts → ${incidents.length} grouped incidents (not 32); whitespace outageKey collapsed`,
    );
  } else {
    passed = false;
    details.push(`Expected 3 incidents, got ${incidents.length}`);
  }

  const primary = incidents.find((i) => i.outageKey === primaryOutage);
  if (
    primary &&
    primary.alertCount === 30 &&
    primary.alertIds.length === 30 &&
    primary.alertIds.every((id, idx) => id === primaryAlerts[idx]!.alertId) &&
    primary.severity === AlertSeverity.P0 &&
    primary.uniqueSourceCount === 6 &&
    primary.uniqueSources.length === 6 &&
    primary.status === "open" &&
    primary.liveProviderWiring === "NOT_WIRED" &&
    primary.externalEffects === "NONE" &&
    primary.fixtureOnly === true &&
    primary.firstRaisedAtIso === primaryAlerts[0]!.raisedAtIso &&
    primary.lastRaisedAtIso === primaryAlerts[29]!.raisedAtIso
  ) {
    details.push(
      `outageKey=${primaryOutage} → 1 incident alertCount=30 severity=P0 uniqueSourceCount=6 chronological alertIds (shuffled input); liveProviderWiring=NOT_WIRED`,
    );
  } else {
    passed = false;
    details.push(`Primary grouping unexpectedly ${JSON.stringify(primary)}`);
  }

  const secondary = incidents.find((i) => i.outageKey === secondaryOutage);
  if (
    secondary &&
    secondary.alertCount === 1 &&
    secondary.severity === AlertSeverity.P2 &&
    secondary.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      `Distinct outageKey=${secondaryOutage} kept as separate incident alertCount=1`,
    );
  } else {
    passed = false;
    details.push(
      `Secondary grouping unexpectedly ${JSON.stringify(secondary)}`,
    );
  }

  const tertiary = incidents.find((i) => i.outageKey === tertiaryOutage);
  if (
    tertiary &&
    tertiary.alertCount === 1 &&
    tertiary.severity === AlertSeverity.P3 &&
    tertiary.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      `Third outageKey=${tertiaryOutage} kept separate (no silent cross-key merge)`,
    );
  } else {
    passed = false;
    details.push(`Tertiary grouping unexpectedly ${JSON.stringify(tertiary)}`);
  }

  // Negative control: ungrouped fan-out would equal alert count — must not.
  if (incidents.length < allAlerts.length) {
    details.push(
      "Incident count < alert count — no one-alert-one-incident fan-out",
    );
  } else {
    passed = false;
    details.push("Incident fan-out matched alert count (grouping failed)");
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );

  return {
    proofId: `proof-alert-group-${randomUUID()}`,
    kind: SoakProofKind.THIRTY_ALERTS_ONE_OUTAGE_GROUPED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx068-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
