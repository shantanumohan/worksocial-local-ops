-- M7 / NEXT-18 after-hours hardening: delivered status, webhook coalesce events,
-- ownership versioning ledger, lead coalesce keys.
-- File-backed inbox store remains the runtime until Postgres is bound.
-- Live inbox providers and live Zoho remain NOT_WIRED. Temporal may stay NOT_WIRED.

-- Expand message send_status to include delivered (acceptance ≠ delivery).
ALTER TABLE journey.messages
  DROP CONSTRAINT IF EXISTS messages_send_status_check;

ALTER TABLE journey.messages
  ADD CONSTRAINT messages_send_status_check
  CHECK (send_status IN (
    'draft', 'queued', 'sent', 'delivered', 'cancelled', 'failed', 'blocked_takeover'
  ));

ALTER TABLE journey.messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Concierge draft invalidation (companion; drafts remain primarily file-backed).
CREATE TABLE IF NOT EXISTS journey.concierge_drafts (
  draft_id             text PRIMARY KEY,
  conversation_id      text NOT NULL REFERENCES journey.conversations (conversation_id),
  body                 text NOT NULL,
  cited_fact_ids       jsonb NOT NULL DEFAULT '[]'::jsonb,
  prepared_at_version  integer NOT NULL,
  qualification        text NOT NULL
    CHECK (qualification IN ('unqualified', 'qualified', 'needs_human')),
  asks_for_human       boolean NOT NULL DEFAULT false,
  booking_claim        text
    CHECK (booking_claim IS NULL OR booking_claim IN (
      'recommendation', 'tour_request', 'availability_link', 'reservation'
    )),
  created_at           timestamptz NOT NULL,
  invalidated_at       timestamptz
);

CREATE INDEX IF NOT EXISTS concierge_drafts_conversation_idx
  ON journey.concierge_drafts (conversation_id);

-- Durable fixture webhook envelopes — coalesce by provider_event_id.
CREATE TABLE IF NOT EXISTS journey.inbox_webhook_events (
  event_id             text PRIMARY KEY,
  provider_event_id    text NOT NULL,
  provider_thread_id   text NOT NULL,
  provider_message_id  text NOT NULL,
  channel              text NOT NULL
    CHECK (channel IN ('fixture', 'email', 'web_chat', 'sms', 'whatsapp')),
  body                 text NOT NULL,
  customer_display_name text NOT NULL,
  customer_email       text,
  conversation_id      text,
  message_id           text,
  coalesced            boolean NOT NULL DEFAULT false,
  fixture_only         boolean NOT NULL DEFAULT true,
  received_at          timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS inbox_webhook_provider_event_uidx
  ON journey.inbox_webhook_events (provider_event_id);

CREATE INDEX IF NOT EXISTS inbox_webhook_thread_idx
  ON journey.inbox_webhook_events (provider_thread_id);

-- Ownership / version audit for takeover + handoff.
CREATE TABLE IF NOT EXISTS journey.conversation_ownership_events (
  event_id             text PRIMARY KEY,
  conversation_id      text NOT NULL REFERENCES journey.conversations (conversation_id),
  kind                 text NOT NULL
    CHECK (kind IN ('lease', 'takeover', 'handoff')),
  from_version         integer NOT NULL,
  to_version           integer NOT NULL,
  actor_user_id        text,
  detail               text NOT NULL,
  at                   timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS conversation_ownership_conv_idx
  ON journey.conversation_ownership_events (conversation_id);

-- Lead coalesce keys (duplicate inbound must not create duplicate CRM leads).
ALTER TABLE journey.qualified_leads
  ADD COLUMN IF NOT EXISTS source_inbound_message_id text;

ALTER TABLE journey.qualified_leads
  ADD COLUMN IF NOT EXISTS provider_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS qualified_leads_inbound_coalesce_uidx
  ON journey.qualified_leads (conversation_id, source_inbound_message_id)
  WHERE source_inbound_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS qualified_leads_event_coalesce_uidx
  ON journey.qualified_leads (conversation_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
