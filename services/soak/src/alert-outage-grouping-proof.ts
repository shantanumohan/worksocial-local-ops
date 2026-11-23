/**
 * Fixture proof for T-X068 — Thirty alerts one outage → grouped incident.
 * External effects: NONE.
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
      outageKey: primaryOutage,
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

  const incidents = groupAlertsIntoIncidents({
    alerts: [...primaryAlerts, ...secondaryAlerts],
    incidentIdForOutageKey: (k) => `inc-${k.replace(/[^a-z0-9-]/gi, "-")}`,
  });

  if (incidents.length === 2) {
    details.push(
      `31 alerts → ${incidents.length} grouped incidents (not 31)`,
    );
  } else {
    passed = false;
    details.push(`Expected 2 incidents, got ${incidents.length}`);
  }

  const primary = incidents.find((i) => i.outageKey === primaryOutage);
  if (
    primary &&
    primary.alertCount === 30 &&
    primary.alertIds.length === 30 &&
    primary.severity === AlertSeverity.P0 &&
    primary.status === "open" &&
    primary.externalEffects === "NONE" &&
    primary.fixtureOnly === true
  ) {
    details.push(
      `outageKey=${primaryOutage} → 1 incident alertCount=30 severity=P0 (thirty alerts coalesced)`,
    );
  } else {
    passed = false;
    details.push(`Primary grouping unexpectedly ${JSON.stringify(primary)}`);
  }

  const secondary = incidents.find((i) => i.outageKey === secondaryOutage);
  if (
    secondary &&
    secondary.alertCount === 1 &&
    secondary.severity === AlertSeverity.P2
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

  // Negative control: ungrouped fan-out would equal alert count — must not.
  if (incidents.length < primaryAlerts.length + secondaryAlerts.length) {
    details.push(
      "Incident count < alert count — no one-alert-one-incident fan-out",
    );
  } else {
    passed = false;
    details.push("Incident fan-out matched alert count (grouping failed)");
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

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
