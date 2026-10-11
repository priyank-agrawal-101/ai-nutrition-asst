-- Additive upgrade: preserve existing attempts and observed failures.
ALTER TABLE attempts DROP CONSTRAINT attempts_failure_code_check;
ALTER TABLE attempts ADD CONSTRAINT attempts_failure_code_check CHECK(failure_code IN ('MODEL_SERVICE_FAILED','OUTPUT_INVALID','OUTPUT_REJECTED','SAFETY_CHECK_FAILED','ATTEMPT_TIMEOUT','STORAGE_FAILED','ATTEMPT_FAILED','PROVIDER_RATE_LIMITED','PROVIDER_CAPACITY_EXCEEDED'));
ALTER TABLE attempts ADD COLUMN retry_at timestamptz;
ALTER TABLE attempts ADD CONSTRAINT attempt_retry_time CHECK((retry_at IS NOT NULL) = (coalesce(failure_code='PROVIDER_RATE_LIMITED',false)));
CREATE FUNCTION guard_attempt_v3() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','finished_at','failure_code','failure_message','input_reason','input_route','retry_at']) <> (to_jsonb(OLD)-ARRAY['status','finished_at','failure_code','failure_message','input_reason','input_route','retry_at']) OR (OLD.status<>'running' AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'immutable attempt'; END IF;
 IF OLD.input_reason IS NOT NULL AND (NEW.input_reason IS DISTINCT FROM OLD.input_reason OR NEW.input_route IS DISTINCT FROM OLD.input_route) THEN RAISE EXCEPTION 'immutable safety decision'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER attempts_immutable ON attempts;
CREATE TRIGGER attempts_immutable BEFORE UPDATE ON attempts FOR EACH ROW EXECUTE FUNCTION guard_attempt_v3();
-- One configured account; no credentials, conversation identifiers or text.
CREATE TABLE provider_cooldown (
 id integer PRIMARY KEY CHECK(id=1),
 retry_at timestamptz NOT NULL
);
