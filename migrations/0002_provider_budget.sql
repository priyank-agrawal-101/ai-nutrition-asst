-- Account usage survives session cleanup. No transcript, key, session or visitor identifier.
CREATE TABLE provider_budget (
 id uuid PRIMARY KEY,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reserved_tokens integer NOT NULL CHECK(reserved_tokens BETWEEN 1 AND 131072),
 observed_tokens bigint CHECK(observed_tokens BETWEEN 0 AND 9007199254740991)
);
CREATE INDEX provider_budget_started ON provider_budget(started_at);
ALTER TABLE attempts ADD COLUMN input_reason text CHECK(input_reason IN ('general_education','calorie_target','weight_target','medical_advice','mixed_request','urgent_help','harmful_body_change','sensitive_personalization','unsafe_food_request','ambiguous_intent','unsupported_language','unrelated_topic'));
ALTER TABLE attempts ADD COLUMN input_route text CHECK(input_route IN ('code','model'));
ALTER TABLE attempts ADD CONSTRAINT safety_decision_pair CHECK((input_reason IS NULL)=(input_route IS NULL));
CREATE FUNCTION guard_attempt_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','finished_at','failure_code','failure_message','input_reason','input_route']) <> (to_jsonb(OLD)-ARRAY['status','finished_at','failure_code','failure_message','input_reason','input_route']) OR (OLD.status<>'running' AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'immutable attempt'; END IF;
 IF OLD.input_reason IS NOT NULL AND (NEW.input_reason IS DISTINCT FROM OLD.input_reason OR NEW.input_route IS DISTINCT FROM OLD.input_route) THEN RAISE EXCEPTION 'immutable safety decision'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER attempts_immutable ON attempts;
CREATE TRIGGER attempts_immutable BEFORE UPDATE ON attempts FOR EACH ROW EXECUTE FUNCTION guard_attempt_v2();
