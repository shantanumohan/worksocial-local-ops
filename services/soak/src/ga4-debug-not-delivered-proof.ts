/**
 * Fixture proof for T-US-008 / T-X032 — GA4 debug validation success is not a
 * delivered conversion / measured receipt. External effects: NONE.
 * Live wiring NOT_WIRED. Hillclimb: honesty stamps, refuse delivered-conversion
 * claim, refuse LIVE debug wiring.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  Ga4ValidationKind,
  SoakProofKind,
  interpretGa4DebugValidation,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-008 + T-X032 fixture ACCEPTED.
 */
export function proofGa4DebugNotDeliveredConversion(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const ok = interpretGa4DebugValidation({ debugEndpointAccepted: true });
  if (
    ok.kind === Ga4ValidationKind.DEBUG_VALIDATION &&
    ok.debugOk === true &&
    ok.deliveredConversionClaimed === false &&
    ok.measuredReceiptClaimed === false &&
    ok.liveProviderWiring === "NOT_WIRED" &&
    ok.externalEffects === "NONE" &&
    ok.fixtureOnly === true &&
    ok.environment === AnalyticsEnvironment.FIXTURE &&
    ok.code === null &&
    /not a measured receipt|delivered conversion/i.test(ok.reasons.join(" "))
  ) {
    details.push(
      "Debug validation success → debugOk; deliveredConversionClaimed=false; measuredReceiptClaimed=false; liveProviderWiring=NOT_WIRED; environment=FIXTURE",
    );
  } else {
    passed = false;
    details.push(`Accepted debug unexpectedly ${JSON.stringify(ok)}`);
  }

  const rejected = interpretGa4DebugValidation({
    debugEndpointAccepted: false,
  });
  if (
    rejected.kind === Ga4ValidationKind.DEBUG_VALIDATION &&
    rejected.debugOk === false &&
    rejected.deliveredConversionClaimed === false &&
    rejected.measuredReceiptClaimed === false &&
    rejected.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Debug validation reject → debugOk=false; still no delivered conversion claim",
    );
  } else {
    passed = false;
    details.push(`Rejected debug unexpectedly ${JSON.stringify(rejected)}`);
  }

  const claimRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimDeliveredConversion: true,
  });
  if (
    claimRefused.code === "DELIVERED_CONVERSION_CLAIM_REFUSED" &&
    claimRefused.deliveredConversionClaimed === false &&
    claimRefused.measuredReceiptClaimed === false
  ) {
    details.push(
      "claimDeliveredConversion=true → DELIVERED_CONVERSION_CLAIM_REFUSED; deliveredConversionClaimed=false",
    );
  } else {
    passed = false;
    details.push(
      `Delivered-conversion claim unexpectedly ${JSON.stringify(claimRefused)}`,
    );
  }

  const externalFxRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimExternalEffects: true,
  });
  if (
    externalFxRefused.code === "EXTERNAL_EFFECTS_CLAIM_REFUSED" &&
    externalFxRefused.externalEffects === "NONE"
  ) {
    details.push(
      "claimExternalEffects=true → EXTERNAL_EFFECTS_CLAIM_REFUSED; externalEffects=NONE",
    );
  } else {
    passed = false;
    details.push(
      `External-effects claim unexpectedly ${JSON.stringify(externalFxRefused)}`,
    );
  }

  const fixtureVerifiedRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimFixtureVerified: true,
  });
  if (
    fixtureVerifiedRefused.code === "FIXTURE_VERIFIED_CLAIM_REFUSED" &&
    fixtureVerifiedRefused.deliveredConversionClaimed === false &&
    fixtureVerifiedRefused.measuredReceiptClaimed === false
  ) {
    details.push(
      "claimFixtureVerified=true → FIXTURE_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Fixture VERIFIED claim unexpectedly ${JSON.stringify(fixtureVerifiedRefused)}`,
    );
  }

  const sandboxClaimRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimSandboxVerified: true,
  });
  if (
    sandboxClaimRefused.code === "SANDBOX_VERIFIED_CLAIM_REFUSED" &&
    sandboxClaimRefused.deliveredConversionClaimed === false &&
    sandboxClaimRefused.measuredReceiptClaimed === false
  ) {
    details.push(
      "claimSandboxVerified=true → SANDBOX_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Sandbox VERIFIED claim unexpectedly ${JSON.stringify(sandboxClaimRefused)}`,
    );
  }

  const integrationVerifiedRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimIntegrationVerified: true,
  });
  if (
    integrationVerifiedRefused.code === "INTEGRATION_VERIFIED_CLAIM_REFUSED" &&
    integrationVerifiedRefused.externalEffects === "NONE"
  ) {
    details.push(
      "claimIntegrationVerified=true → INTEGRATION_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Integration VERIFIED claim unexpectedly ${JSON.stringify(integrationVerifiedRefused)}`,
    );
  }

  const measurementProtocolRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimMeasurementProtocolVerified: true,
  });
  if (
    measurementProtocolRefused.code ===
      "MEASUREMENT_PROTOCOL_VERIFIED_CLAIM_REFUSED" &&
    measurementProtocolRefused.deliveredConversionClaimed === false &&
    measurementProtocolRefused.measuredReceiptClaimed === false
  ) {
    details.push(
      "claimMeasurementProtocolVerified=true → MEASUREMENT_PROTOCOL_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Measurement Protocol VERIFIED claim unexpectedly ${JSON.stringify(measurementProtocolRefused)}`,
    );
  }

  const reportingAccessRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimReportingAccessVerified: true,
  });
  if (
    reportingAccessRefused.code === "REPORTING_ACCESS_VERIFIED_CLAIM_REFUSED" &&
    reportingAccessRefused.externalEffects === "NONE"
  ) {
    details.push(
      "claimReportingAccessVerified=true → REPORTING_ACCESS_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Reporting-access VERIFIED claim unexpectedly ${JSON.stringify(reportingAccessRefused)}`,
    );
  }

  const dataIngestRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimDataIngestVerified: true,
  });
  if (
    dataIngestRefused.code === "DATA_INGEST_VERIFIED_CLAIM_REFUSED" &&
    dataIngestRefused.measuredReceiptClaimed === false &&
    dataIngestRefused.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "claimDataIngestVerified=true → DATA_INGEST_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Data-ingest VERIFIED claim unexpectedly ${JSON.stringify(dataIngestRefused)}`,
    );
  }

  const payloadShapeRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimPayloadShapeVerified: true,
  });
  if (
    payloadShapeRefused.code === "PAYLOAD_SHAPE_VERIFIED_CLAIM_REFUSED" &&
    payloadShapeRefused.deliveredConversionClaimed === false &&
    payloadShapeRefused.externalEffects === "NONE"
  ) {
    details.push(
      "claimPayloadShapeVerified=true → PAYLOAD_SHAPE_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Payload-shape VERIFIED claim unexpectedly ${JSON.stringify(payloadShapeRefused)}`,
    );
  }

  const eventDeliveryRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimEventDeliveryVerified: true,
  });
  if (
    eventDeliveryRefused.code === "EVENT_DELIVERY_VERIFIED_CLAIM_REFUSED" &&
    eventDeliveryRefused.measuredReceiptClaimed === false &&
    eventDeliveryRefused.externalEffects === "NONE"
  ) {
    details.push(
      "claimEventDeliveryVerified=true → EVENT_DELIVERY_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Event-delivery VERIFIED claim unexpectedly ${JSON.stringify(eventDeliveryRefused)}`,
    );
  }

  const hitCollectionRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimHitCollectionVerified: true,
  });
  if (
    hitCollectionRefused.code === "HIT_COLLECTION_VERIFIED_CLAIM_REFUSED" &&
    hitCollectionRefused.deliveredConversionClaimed === false &&
    hitCollectionRefused.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "claimHitCollectionVerified=true → HIT_COLLECTION_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Hit-collection VERIFIED claim unexpectedly ${JSON.stringify(hitCollectionRefused)}`,
    );
  }

  const batchExportRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimBatchExportVerified: true,
  });
  if (
    batchExportRefused.code === "BATCH_EXPORT_VERIFIED_CLAIM_REFUSED" &&
    batchExportRefused.measuredReceiptClaimed === false &&
    batchExportRefused.externalEffects === "NONE"
  ) {
    details.push(
      "claimBatchExportVerified=true → BATCH_EXPORT_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Batch-export VERIFIED claim unexpectedly ${JSON.stringify(batchExportRefused)}`,
    );
  }

  const realtimeIngestRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimRealtimeIngestVerified: true,
  });
  if (
    realtimeIngestRefused.code === "REALTIME_INGEST_VERIFIED_CLAIM_REFUSED" &&
    realtimeIngestRefused.liveProviderWiring === "NOT_WIRED" &&
    realtimeIngestRefused.externalEffects === "NONE"
  ) {
    details.push(
      "claimRealtimeIngestVerified=true → REALTIME_INGEST_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Realtime-ingest VERIFIED claim unexpectedly ${JSON.stringify(realtimeIngestRefused)}`,
    );
  }

  const streamingExportRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimStreamingExportVerified: true,
  });
  if (
    streamingExportRefused.code === "STREAMING_EXPORT_VERIFIED_CLAIM_REFUSED" &&
    streamingExportRefused.deliveredConversionClaimed === false &&
    streamingExportRefused.fixtureOnly === true
  ) {
    details.push(
      "claimStreamingExportVerified=true → STREAMING_EXPORT_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Streaming-export VERIFIED claim unexpectedly ${JSON.stringify(streamingExportRefused)}`,
    );
  }

  const audienceExportRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimAudienceExportVerified: true,
  });
  if (
    audienceExportRefused.code === "AUDIENCE_EXPORT_VERIFIED_CLAIM_REFUSED" &&
    audienceExportRefused.measuredReceiptClaimed === false &&
    audienceExportRefused.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "claimAudienceExportVerified=true → AUDIENCE_EXPORT_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Audience-export VERIFIED claim unexpectedly ${JSON.stringify(audienceExportRefused)}`,
    );
  }

  const debugVerifiedRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimDebugVerified: true,
  });
  if (
    debugVerifiedRefused.code === "DEBUG_VERIFIED_CLAIM_REFUSED" &&
    debugVerifiedRefused.deliveredConversionClaimed === false &&
    debugVerifiedRefused.measuredReceiptClaimed === false
  ) {
    details.push(
      "claimDebugVerified=true → DEBUG_VERIFIED_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Debug VERIFIED claim unexpectedly ${JSON.stringify(debugVerifiedRefused)}`,
    );
  }

  const liveClaimRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimLiveProviderSuccess: true,
  });
  if (
    liveClaimRefused.code === "LIVE_CLAIM_REFUSED" &&
    liveClaimRefused.deliveredConversionClaimed === false &&
    liveClaimRefused.measuredReceiptClaimed === false &&
    liveClaimRefused.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "claimLiveProviderSuccess=true → LIVE_CLAIM_REFUSED; liveProviderSuccessClaimed=false",
    );
  } else {
    passed = false;
    details.push(
      `Live provider claim unexpectedly ${JSON.stringify(liveClaimRefused)}`,
    );
  }

  const receiptRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimMeasuredReceipt: true,
  });
  if (
    receiptRefused.code === "MEASURED_RECEIPT_CLAIM_REFUSED" &&
    receiptRefused.measuredReceiptClaimed === false &&
    receiptRefused.deliveredConversionClaimed === false
  ) {
    details.push(
      "claimMeasuredReceipt=true → MEASURED_RECEIPT_CLAIM_REFUSED; measuredReceiptClaimed=false",
    );
  } else {
    passed = false;
    details.push(
      `Measured-receipt claim unexpectedly ${JSON.stringify(receiptRefused)}`,
    );
  }

  const liveRefused = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    environment: AnalyticsEnvironment.LIVE,
  });
  if (
    liveRefused.code === "LIVE_DEBUG_WIRING_NOT_WIRED" &&
    liveRefused.debugOk === false &&
    liveRefused.deliveredConversionClaimed === false &&
    liveRefused.liveProviderWiring === "NOT_WIRED" &&
    liveRefused.fixtureOnly === false &&
    liveRefused.environment === AnalyticsEnvironment.LIVE
  ) {
    details.push(
      "LIVE debug → LIVE_DEBUG_WIRING_NOT_WIRED; debugOk=false; no delivered conversion",
    );
  } else {
    passed = false;
    details.push(`LIVE debug unexpectedly ${JSON.stringify(liveRefused)}`);
  }

  const sandboxOk = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    environment: AnalyticsEnvironment.SANDBOX,
  });
  if (
    sandboxOk.debugOk === true &&
    sandboxOk.fixtureOnly === false &&
    sandboxOk.environment === AnalyticsEnvironment.SANDBOX &&
    sandboxOk.deliveredConversionClaimed === false
  ) {
    details.push(
      "SANDBOX debug → debugOk; fixtureOnly=false (not collapsed into fixture)",
    );
  } else {
    passed = false;
    details.push(`SANDBOX debug unexpectedly ${JSON.stringify(sandboxOk)}`);
  }

  const a20Delivered1 = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimDeliveredConversion: true,
  });
  const a20Delivered2 = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimDeliveredConversion: true,
  });
  const a20Delivered3 = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimDeliveredConversion: true,
  });
  if (
    a20Delivered1.code === "DELIVERED_CONVERSION_CLAIM_REFUSED" &&
    a20Delivered2.code === "DELIVERED_CONVERSION_CLAIM_REFUSED" &&
    a20Delivered3.code === "DELIVERED_CONVERSION_CLAIM_REFUSED" &&
    a20Delivered3.deliveredConversionClaimed === false &&
    a20Delivered3.measuredReceiptClaimed === false &&
    a20Delivered3.liveProviderWiring === "NOT_WIRED" &&
    a20Delivered3.externalEffects === "NONE"
  ) {
    details.push(
      "A20 tip-moved-293 train: triple repeat claimDeliveredConversion → DELIVERED_CONVERSION_CLAIM_REFUSED; no delivery/receipt",
    );
  } else {
    passed = false;
    details.push(
      `A20 triple delivered unexpectedly ${JSON.stringify({ a20Delivered3 })}`,
    );
  }

  const a20Rejected1 = interpretGa4DebugValidation({
    debugEndpointAccepted: false,
    claimDeliveredConversion: true,
  });
  const a20Rejected2 = interpretGa4DebugValidation({
    debugEndpointAccepted: false,
    claimDeliveredConversion: true,
  });
  const a20Rejected3 = interpretGa4DebugValidation({
    debugEndpointAccepted: false,
    claimDeliveredConversion: true,
  });
  if (
    a20Rejected1.code === "DELIVERED_CONVERSION_CLAIM_REFUSED" &&
    a20Rejected2.code === "DELIVERED_CONVERSION_CLAIM_REFUSED" &&
    a20Rejected3.code === "DELIVERED_CONVERSION_CLAIM_REFUSED" &&
    a20Rejected3.debugOk === false &&
    a20Rejected3.deliveredConversionClaimed === false &&
    a20Rejected3.externalEffects === "NONE"
  ) {
    details.push(
      "A20 tip-moved-293 edge: rejected-debug triple claimDeliveredConversion → DELIVERED_CONVERSION_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `A20 rejected-debug triple unexpectedly ${JSON.stringify({ a20Rejected3 })}`,
    );
  }

  const a20Receipt1 = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimMeasuredReceipt: true,
  });
  const a20Receipt2 = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimMeasuredReceipt: true,
  });
  const a20Receipt3 = interpretGa4DebugValidation({
    debugEndpointAccepted: true,
    claimMeasuredReceipt: true,
  });
  if (
    a20Receipt1.code === "MEASURED_RECEIPT_CLAIM_REFUSED" &&
    a20Receipt2.code === "MEASURED_RECEIPT_CLAIM_REFUSED" &&
    a20Receipt3.code === "MEASURED_RECEIPT_CLAIM_REFUSED" &&
    a20Receipt3.measuredReceiptClaimed === false &&
    a20Receipt3.deliveredConversionClaimed === false &&
    a20Receipt3.externalEffects === "NONE"
  ) {
    details.push(
      "A20 tip-moved-293 edge measured-receipt: triple claimMeasuredReceipt → MEASURED_RECEIPT_CLAIM_REFUSED; no receipt",
    );
  } else {
    passed = false;
    details.push(
      `A20 measured-receipt triple unexpectedly ${JSON.stringify({ a20Receipt3 })}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );

  return {
    proofId: `proof-ga4-debug-${randomUUID()}`,
    kind: SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-ga4-debug-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
