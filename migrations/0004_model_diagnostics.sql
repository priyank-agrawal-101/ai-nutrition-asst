-- Local operator diagnostics, never returned in the public chat API.
CREATE TABLE model_diagnostics (
 attempt_id uuid PRIMARY KEY REFERENCES attempts DEFERRABLE INITIALLY DEFERRED,
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 reason text NOT NULL CHECK(reason IN ('INPUT_BOUNDARY','MODEL_SERVICE_FAILED','OUTPUT_INVALID','OUTPUT_REJECTED','SAFETY_CHECK_FAILED','ATTEMPT_TIMEOUT','STORAGE_FAILED','ATTEMPT_FAILED','PROVIDER_RATE_LIMITED','PROVIDER_CAPACITY_EXCEEDED')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=524288),
 CHECK(expires_at>captured_at AND expires_at<=captured_at+interval '24 hours 1 second')
);
CREATE INDEX diagnostics_expiry ON model_diagnostics(expires_at);
