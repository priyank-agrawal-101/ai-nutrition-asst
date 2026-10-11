CREATE TABLE sessions (
 id uuid PRIMARY KEY, token_digest bytea NOT NULL UNIQUE CHECK(octet_length(token_digest)=32),
 csrf_nonce bytea NOT NULL CHECK(octet_length(csrf_nonce)=32), csrf_key_version text NOT NULL CHECK(length(csrf_key_version) BETWEEN 1 AND 32),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL, revoked_at timestamptz,
 CHECK(expires_at > created_at)
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX sessions_revoked ON sessions(revoked_at) WHERE revoked_at IS NOT NULL;
CREATE TABLE conversations (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES sessions DEFERRABLE INITIALLY DEFERRED,
 client_conversation_id uuid NOT NULL, revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(session_id, client_conversation_id)
);
CREATE INDEX conversations_owner ON conversations(session_id, created_at);
CREATE TABLE turns (
 id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations DEFERRABLE INITIALLY DEFERRED,
 client_submission_id uuid NOT NULL, sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 20),
 normalized_question text NOT NULL CHECK(char_length(normalized_question) BETWEEN 1 AND 2000 AND normalized_question ~ '[^[:space:]]'),
 question_digest bytea NOT NULL CHECK(octet_length(question_digest)=32), normalization_version text NOT NULL CHECK(normalization_version='v1'),
 status text NOT NULL CHECK(status IN ('running','completed','failed')), current_attempt_id uuid NOT NULL,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 UNIQUE(conversation_id,client_submission_id), UNIQUE(conversation_id,sequence)
);
CREATE UNIQUE INDEX turns_running ON turns(conversation_id) WHERE status='running';
CREATE TABLE attempts (
 id uuid PRIMARY KEY, turn_id uuid NOT NULL REFERENCES turns DEFERRABLE INITIALLY DEFERRED,
 number integer NOT NULL CHECK(number BETWEEN 1 AND 3), client_attempt_id uuid, retries_attempt_id uuid,
 status text NOT NULL CHECK(status IN ('running','completed','failed')),
 started_at timestamptz NOT NULL, deadline_at timestamptz NOT NULL CHECK(deadline_at > started_at), finished_at timestamptz,
 failure_code text CHECK(failure_code IN ('MODEL_SERVICE_FAILED','OUTPUT_INVALID','OUTPUT_REJECTED','SAFETY_CHECK_FAILED','ATTEMPT_TIMEOUT','STORAGE_FAILED','ATTEMPT_FAILED')),
 failure_message text, context_revision bigint NOT NULL CHECK(context_revision BETWEEN 0 AND 9007199254740991),
 context_through_sequence integer NOT NULL CHECK(context_through_sequence BETWEEN 1 AND 20), context_digest bytea NOT NULL CHECK(octet_length(context_digest)=32),
 milestone smallint NOT NULL CHECK(milestone IN (1,2)), run_manifest jsonb NOT NULL CHECK(jsonb_typeof(run_manifest)='object' AND octet_length(run_manifest::text)<=32768),
 UNIQUE(turn_id,number), UNIQUE(turn_id,id), UNIQUE(turn_id,client_attempt_id),
 FOREIGN KEY(turn_id,retries_attempt_id) REFERENCES attempts(turn_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((number=1 AND client_attempt_id IS NULL AND retries_attempt_id IS NULL) OR (number>1 AND client_attempt_id IS NOT NULL AND retries_attempt_id IS NOT NULL)),
 CHECK((status='running' AND finished_at IS NULL AND failure_code IS NULL AND failure_message IS NULL) OR
 (status='completed' AND finished_at IS NOT NULL AND failure_code IS NULL AND failure_message IS NULL) OR
 (status='failed' AND finished_at IS NOT NULL AND failure_code IS NOT NULL AND failure_message IS NOT NULL AND char_length(failure_message) BETWEEN 1 AND 300)),
 CHECK(finished_at IS NULL OR finished_at >= started_at)
);
ALTER TABLE turns ADD CONSTRAINT current_attempt_scope FOREIGN KEY(id,current_attempt_id) REFERENCES attempts(turn_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX attempts_running ON attempts(turn_id) WHERE status='running';
CREATE UNIQUE INDEX attempts_completed ON attempts(turn_id) WHERE status='completed';
CREATE INDEX attempts_deadline ON attempts(deadline_at) WHERE status='running';

CREATE FUNCTION valid_text_v1(v jsonb, max_chars integer) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(jsonb_typeof(v)='string' AND char_length(v #>> '{}') BETWEEN 1 AND max_chars AND (v #>> '{}') ~ '[^[:space:]]', false)
$$;
CREATE FUNCTION valid_answer_v1(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE c jsonb; s jsonb;
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT(v ?& ARRAY['answer','claims']) OR v - ARRAY['answer','claims'] <> '{}' OR NOT valid_text_v1(v->'answer',6000) OR jsonb_typeof(v->'claims') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(v->'claims')>20 THEN RETURN false; END IF;
 FOR c IN SELECT jsonb_array_elements(v->'claims') LOOP
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT(c ?& ARRAY['text','source']) OR c - ARRAY['text','source'] <> '{}' OR NOT valid_text_v1(c->'text',600) THEN RETURN false; END IF;
  s := c->'source';
  IF s <> 'null'::jsonb THEN
   IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR NOT(s ?& ARRAY['id','title','url','locator']) OR s - ARRAY['id','title','url','locator'] <> '{}' THEN RETURN false; END IF;
   IF jsonb_typeof(s->'id') IS DISTINCT FROM 'string' OR (s->>'id') !~ '^[A-Za-z0-9_-]{1,128}$' OR NOT valid_text_v1(s->'title',300) THEN RETURN false; END IF;
   IF s->'locator' <> 'null'::jsonb AND NOT valid_text_v1(s->'locator',300) THEN RETURN false; END IF;
   IF s->'url' <> 'null'::jsonb AND (NOT valid_text_v1(s->'url',2048) OR (s->>'url') !~ '^https://[^/@[:space:]]+([/?#]|$)' OR (s->>'url') ~ '[[:cntrl:][:space:]]') THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
END $$;
CREATE TABLE messages (
 id uuid PRIMARY KEY, turn_id uuid NOT NULL REFERENCES turns DEFERRABLE INITIALLY DEFERRED,
 role text NOT NULL CHECK(role IN ('user','assistant')), attempt_id uuid, user_text text, content jsonb,
 response_kind text, content_schema_version text, created_at timestamptz NOT NULL,
 UNIQUE(turn_id,role), FOREIGN KEY(turn_id,attempt_id) REFERENCES attempts(turn_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((role='user' AND attempt_id IS NULL AND user_text IS NOT NULL AND octet_length(user_text)<=16384 AND content IS NULL AND response_kind IS NULL AND content_schema_version IS NULL) OR
 (role='assistant' AND attempt_id IS NOT NULL AND user_text IS NULL AND content IS NOT NULL AND valid_answer_v1(content) AND response_kind IN ('answer','refusal','clarification') AND response_kind IS NOT NULL AND content_schema_version='v1' AND content_schema_version IS NOT NULL))
);
CREATE TABLE provider_calls (
 id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES attempts DEFERRABLE INITIALLY DEFERRED,
 phase text NOT NULL CHECK(phase IN ('input_safety','answer','output_safety')), call_number integer NOT NULL CHECK(call_number=1),
 provider text NOT NULL CHECK(length(provider) BETWEEN 1 AND 100), requested_model text NOT NULL CHECK(length(requested_model) BETWEEN 1 AND 100), reported_model text,
 request_settings jsonb NOT NULL CHECK(jsonb_typeof(request_settings)='object' AND octet_length(request_settings::text)<=8192), provider_request_id text,
 status text NOT NULL CHECK(status IN ('started','succeeded','failed','unknown')), started_at timestamptz NOT NULL DEFAULT clock_timestamp(), ended_at timestamptz,
 duration_ms bigint CHECK(duration_ms BETWEEN 0 AND 9007199254740991), finish_code text, error_code text, validation_code text,
 input_tokens bigint CHECK(input_tokens BETWEEN 0 AND 9007199254740991), output_tokens bigint CHECK(output_tokens BETWEEN 0 AND 9007199254740991),
 cached_input_tokens bigint CHECK(cached_input_tokens BETWEEN 0 AND input_tokens), reasoning_tokens bigint CHECK(reasoning_tokens BETWEEN 0 AND output_tokens),
 cost_amount numeric(20,8) CHECK(cost_amount>=0), cost_currency char(3), cost_kind text, pricing_reference text, usage_updated_at timestamptz,
 UNIQUE(attempt_id,phase,call_number), CHECK((status='started' AND ended_at IS NULL) OR (status<>'started' AND ended_at IS NOT NULL)),
 CHECK((cost_amount IS NULL AND cost_currency IS NULL AND cost_kind IS NULL AND pricing_reference IS NULL) OR (cost_amount IS NOT NULL AND cost_currency IS NOT NULL AND cost_kind IS NOT NULL AND cost_kind IN ('reported','estimated') AND (cost_kind='reported' OR pricing_reference IS NOT NULL))),
 CHECK(cached_input_tokens IS NULL OR input_tokens IS NOT NULL), CHECK(reasoning_tokens IS NULL OR output_tokens IS NOT NULL)
);
CREATE INDEX calls_started ON provider_calls(started_at);
CREATE TABLE quota_buckets (
 rule_key text NOT NULL, subject_digest bytea NOT NULL CHECK(octet_length(subject_digest)=32), key_version text NOT NULL,
 window_start timestamptz NOT NULL, used_count integer NOT NULL CHECK(used_count>=0), expires_at timestamptz NOT NULL,
 PRIMARY KEY(rule_key,subject_digest,key_version,window_start)
);
CREATE INDEX quota_expiry ON quota_buckets(expires_at);
CREATE TABLE generation_slots (
 slot_number smallint PRIMARY KEY CHECK(slot_number BETWEEN 1 AND 4), attempt_id uuid UNIQUE REFERENCES attempts DEFERRABLE INITIALLY DEFERRED, leased_until timestamptz,
 CHECK((attempt_id IS NULL)=(leased_until IS NULL))
);
INSERT INTO generation_slots(slot_number) SELECT generate_series(1,4);

CREATE FUNCTION guard_immutable_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='messages' THEN
  IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'immutable message'; END IF;
 ELSIF TG_TABLE_NAME='conversations' THEN
  IF (NEW.id,NEW.session_id,NEW.client_conversation_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.session_id,OLD.client_conversation_id,OLD.created_at) THEN RAISE EXCEPTION 'immutable owner'; END IF;
 ELSIF TG_TABLE_NAME='turns' THEN
  IF ((to_jsonb(NEW)-ARRAY['status','current_attempt_id','updated_at']) <> (to_jsonb(OLD)-ARRAY['status','current_attempt_id','updated_at']) OR (OLD.status='completed' AND NEW IS DISTINCT FROM OLD)) THEN RAISE EXCEPTION 'immutable turn'; END IF;
 ELSIF TG_TABLE_NAME='attempts' THEN
  IF ((to_jsonb(NEW)-ARRAY['status','finished_at','failure_code','failure_message']) <> (to_jsonb(OLD)-ARRAY['status','finished_at','failure_code','failure_message']) OR (OLD.status<>'running' AND NEW IS DISTINCT FROM OLD)) THEN RAISE EXCEPTION 'immutable attempt'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER messages_immutable BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION guard_immutable_v1();
CREATE TRIGGER conversations_immutable BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION guard_immutable_v1();
CREATE TRIGGER turns_immutable BEFORE UPDATE ON turns FOR EACH ROW EXECUTE FUNCTION guard_immutable_v1();
CREATE TRIGGER attempts_immutable BEFORE UPDATE ON attempts FOR EACH ROW EXECUTE FUNCTION guard_immutable_v1();

CREATE FUNCTION check_integrity_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid; cid uuid; t turns; a attempts; m messages; total integer; maxseq integer; sid uuid;
BEGIN
 IF TG_TABLE_NAME='generation_slots' THEN
  IF EXISTS(SELECT 1 FROM generation_slots g JOIN attempts x ON x.id=g.attempt_id WHERE g.leased_until<>x.deadline_at) THEN RAISE EXCEPTION 'slot deadline mismatch'; END IF;
  RETURN NULL;
 END IF;
 IF TG_TABLE_NAME='conversations' THEN cid := coalesce(NEW.id,OLD.id);
 ELSIF TG_TABLE_NAME='turns' THEN tid := coalesce(NEW.id,OLD.id); cid := coalesce(NEW.conversation_id,OLD.conversation_id);
 ELSE tid := coalesce(NEW.turn_id,OLD.turn_id); SELECT conversation_id INTO cid FROM turns WHERE id=tid;
 END IF;
 IF cid IS NOT NULL THEN
  SELECT session_id INTO sid FROM conversations WHERE id=cid;
  SELECT count(*),coalesce(max(sequence),0) INTO total,maxseq FROM turns WHERE conversation_id=cid;
  IF total<>maxseq THEN RAISE EXCEPTION 'noncontiguous conversation'; END IF;
 END IF;
 IF tid IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO t FROM turns WHERE id=tid;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO a FROM attempts WHERE id=t.current_attempt_id;
 IF NOT FOUND OR a.turn_id<>t.id OR a.status<>t.status OR a.number<>(SELECT max(number) FROM attempts WHERE turn_id=tid) THEN RAISE EXCEPTION 'current attempt mismatch'; END IF;
 IF (SELECT count(*) FROM attempts WHERE turn_id=tid)<>a.number THEN RAISE EXCEPTION 'noncontiguous attempts'; END IF;
 IF EXISTS(SELECT 1 FROM attempts x LEFT JOIN attempts p ON p.id=x.retries_attempt_id WHERE x.turn_id=tid AND x.number>1 AND (p.number<>x.number-1 OR p.status<>'failed' OR p.turn_id<>tid)) THEN RAISE EXCEPTION 'invalid retry'; END IF;
 IF NOT EXISTS(SELECT 1 FROM messages WHERE turn_id=tid AND role='user' AND created_at=t.created_at) THEN RAISE EXCEPTION 'missing original question'; END IF;
 SELECT * INTO m FROM messages WHERE turn_id=tid AND role='assistant';
 IF (t.status='completed') IS DISTINCT FROM FOUND THEN RAISE EXCEPTION 'assistant state mismatch'; END IF;
 IF FOUND AND (m.attempt_id<>a.id OR a.status<>'completed' OR (a.milestone=1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.content->'claims') c WHERE c->'source'<>'null'::jsonb))) THEN RAISE EXCEPTION 'assistant attempt or source mismatch'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER integrity_turns AFTER INSERT OR UPDATE OR DELETE ON turns DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_integrity_v1();
CREATE CONSTRAINT TRIGGER integrity_attempts AFTER INSERT OR UPDATE OR DELETE ON attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_integrity_v1();
CREATE CONSTRAINT TRIGGER integrity_messages AFTER INSERT OR UPDATE OR DELETE ON messages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_integrity_v1();
CREATE CONSTRAINT TRIGGER integrity_conversations AFTER INSERT OR UPDATE OR DELETE ON conversations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_integrity_v1();
CREATE CONSTRAINT TRIGGER integrity_slots AFTER INSERT OR UPDATE OR DELETE ON generation_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_integrity_v1();

CREATE FUNCTION guard_purge_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid;
BEGIN
 IF TG_TABLE_NAME='sessions' THEN
  IF OLD.revoked_at IS NULL AND OLD.expires_at>clock_timestamp() THEN RAISE EXCEPTION 'live session deletion forbidden'; END IF; RETURN OLD;
 ELSIF TG_TABLE_NAME='conversations' THEN owner_id := OLD.session_id;
 ELSIF TG_TABLE_NAME='turns' THEN SELECT session_id INTO owner_id FROM conversations WHERE id=OLD.conversation_id;
 ELSIF TG_TABLE_NAME='provider_calls' THEN SELECT c.session_id INTO owner_id FROM attempts a JOIN turns t ON t.id=a.turn_id JOIN conversations c ON c.id=t.conversation_id WHERE a.id=OLD.attempt_id;
 ELSE SELECT c.session_id INTO owner_id FROM turns t JOIN conversations c ON c.id=t.conversation_id WHERE t.id=OLD.turn_id;
 END IF;
 IF EXISTS(SELECT 1 FROM sessions WHERE id=owner_id AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'live payload deletion forbidden'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER purge_sessions BEFORE DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION guard_purge_v1();
CREATE TRIGGER purge_conversations BEFORE DELETE ON conversations FOR EACH ROW EXECUTE FUNCTION guard_purge_v1();
CREATE TRIGGER purge_turns BEFORE DELETE ON turns FOR EACH ROW EXECUTE FUNCTION guard_purge_v1();
CREATE TRIGGER purge_attempts BEFORE DELETE ON attempts FOR EACH ROW EXECUTE FUNCTION guard_purge_v1();
CREATE TRIGGER purge_messages BEFORE DELETE ON messages FOR EACH ROW EXECUTE FUNCTION guard_purge_v1();
CREATE TRIGGER purge_calls BEFORE DELETE ON provider_calls FOR EACH ROW EXECUTE FUNCTION guard_purge_v1();
