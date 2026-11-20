-- R1-09 Customer response / after-hours: conversations, messages, leases,
-- handoffs, qualified leads, booking evidence, and send outcome ledger.
-- Not production-activated. Schema only; file-backed inbox store is used until Postgres is bound.
-- Live inbox providers and live Zoho lead writes remain NOT_WIRED without owner credentials.

CREATE TABLE IF NOT EXISTS care.response_policies (
  policy_id                          text PRIMARY KEY,
  timezone                           text NOT NULL,
  coverage_windows_json              jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_question_ids_json          jsonb NOT NULL DEFAULT '[]'::jsonb,
  escalation_owner                   text NOT NULL,
  max_agent_messages_per_conversation integer NOT NULL DEFAULT 8,
  duplicate_suppression_window_sec   integer NOT NULL DEFAULT 300,
  identify_as_virtual_assistant      boolean NOT NULL DEFAULT true,
  replies_paused                     boolean NOT NULL DEFAULT false,
  updated_at                         timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS care.conversations (
  conversation_id      text PRIMARY KEY,
  provider_thread_id   text NOT NULL,
  channel              text NOT NULL
    CHECK (channel IN ('fixture', 'email', 'web_chat', 'sms', 'whatsapp')),
  version              integer NOT NULL DEFAULT 1,
  human_owned          boolean NOT NULL DEFAULT false,
  agent_send_allowed   boolean NOT NULL DEFAULT true,
  status               text NOT NULL
    CHECK (status IN (
      'open', 'awaiting_customer', 'awaiting_human', 'handed_off', 'closed'
    )),
  customer_display_name text NOT NULL,
  customer_email       text,
  fixture_only         boolean NOT NULL DEFAULT false,
  lease_owner          text,
  lease_expires_at     timestamptz,
  created_at           timestamptz NOT NULL,
  updated_at           timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS conversations_provider_thread_idx
  ON care.conversations (provider_thread_id);

CREATE TABLE IF NOT EXISTS care.messages (
  message_id           text PRIMARY KEY,
  conversation_id      text NOT NULL REFERENCES care.conversations (conversation_id),
  provider_message_id  text,
  direction            text NOT NULL
    CHECK (direction IN ('inbound', 'outbound')),
  body                 text NOT NULL,
  sender               text NOT NULL
    CHECK (sender IN ('customer', 'agent', 'human', 'system')),
  prepared_at_version  integer,
  send_status          text NOT NULL
    CHECK (send_status IN (
      'draft', 'queued', 'sent', 'cancelled', 'failed', 'blocked_takeover'
    )),
  cited_fact_ids       jsonb NOT NULL DEFAULT '[]'::jsonb,
  gateway_operation_id text,
  booking_claim        text
    CHECK (booking_claim IS NULL OR booking_claim IN (
      'recommendation', 'tour_request', 'availability_link', 'reservation'
    )),
  fixture_only         boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL,
  sent_at              timestamptz
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON care.messages (conversation_id);

CREATE UNIQUE INDEX IF NOT EXISTS messages_provider_dedupe_idx
  ON care.messages (conversation_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS care.qualified_leads (
  lead_id              text PRIMARY KEY,
  conversation_id      text NOT NULL,
  correlation_id       text NOT NULL,
  email                text NOT NULL,
  display_name         text NOT NULL,
  location_need        text,
  date_need            text,
  size_need            text,
  qualification        text NOT NULL
    CHECK (qualification IN ('unqualified', 'qualified', 'needs_human')),
  synthetic            boolean NOT NULL DEFAULT true,
  crm_record_id        text,
  fixture_only         boolean NOT NULL DEFAULT false,
  gateway_operation_id text,
  write_path_id        text,
  created_at           timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS qualified_leads_conversation_idx
  ON care.qualified_leads (conversation_id);

CREATE TABLE IF NOT EXISTS care.handoffs (
  handoff_id           text PRIMARY KEY,
  conversation_id      text NOT NULL,
  reason               text NOT NULL,
  urgency              text NOT NULL
    CHECK (urgency IN ('low', 'normal', 'high')),
  next_owner           text NOT NULL,
  customer_questions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_answers     jsonb NOT NULL DEFAULT '[]'::jsonb,
  requested_action     text NOT NULL,
  acknowledged         boolean NOT NULL DEFAULT false,
  acknowledged_at      timestamptz,
  created_at           timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS handoffs_conversation_idx
  ON care.handoffs (conversation_id);

CREATE TABLE IF NOT EXISTS care.booking_evidence (
  evidence_id          text PRIMARY KEY,
  conversation_id      text NOT NULL,
  provider_receipt_id  text NOT NULL,
  claim_kind           text NOT NULL
    CHECK (claim_kind IN (
      'recommendation', 'tour_request', 'availability_link', 'reservation'
    )),
  verified             boolean NOT NULL DEFAULT false,
  observed_at          timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS care.inbox_send_outcomes (
  outcome_id       text PRIMARY KEY,
  write_path_id    text NOT NULL,
  operation_id     text NOT NULL,
  label            text NOT NULL
    CHECK (label IN ('SUCCESS', 'FAILURE', 'UNKNOWN')),
  source           text NOT NULL,
  fixture_only     boolean NOT NULL DEFAULT false,
  summary          text NOT NULL,
  feature_hints    jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at      timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS inbox_send_outcomes_fixture_idx
  ON care.inbox_send_outcomes (fixture_only);
