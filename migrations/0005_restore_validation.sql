-- pg_restore intentionally clears the session search_path. The answer CHECK
-- calls this function during COPY, before post-data triggers are installed.
-- Resolve its helper in the trusted schema without weakening validation or
-- changing saved answers. Earlier applied migrations remain immutable.
ALTER FUNCTION public.valid_answer_v1(jsonb) SET search_path = pg_catalog, public;
