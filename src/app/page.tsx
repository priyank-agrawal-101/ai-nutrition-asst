"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  sessionSchema,
  conversationSchema,
  operationSchema,
  lookupSchema,
  operationId,
  uuid,
  normalize,
  type ConversationView,
} from "@/contracts/api";
import { api, ClientError, mergeConversation } from "@/client/api";
import styles from "./chat.module.css";

const markerSchema = z.strictObject({
  conversation_id: uuid.optional(),
  creation_id: operationId.optional(),
  submission_id: operationId.optional(),
  turn_id: uuid.optional(),
  client_attempt_id: operationId.optional(),
  failed_attempt_id: uuid.optional(),
});
type Marker = z.infer<typeof markerSchema>;
type State = "loading" | "ready" | "waiting" | "unknown" | "unavailable";
export default function Chat() {
  const [state, setState] = useState<State>("loading"),
    [conversation, setConversation] = useState<ConversationView | null>(null),
    [session, setSession] = useState<z.infer<typeof sessionSchema> | null>(
      null,
    ),
    [draft, setDraft] = useState(""),
    [message, setMessage] = useState(""),
    [storageWarning, setStorageWarning] = useState(false),
    [notRecorded, setNotRecorded] = useState(false);
  const marker = useRef<Marker>({}),
    active = useRef(""),
    mounted = useRef(false),
    pendingText = useRef(""),
    pollStarted = useRef(0);
  const save = useCallback((value: Marker) => {
    marker.current = value;
    try {
      sessionStorage.setItem("nutribite.recovery.v1", JSON.stringify(value));
    } catch {
      setStorageWarning(true);
    }
  }, []);
  const adopt = useCallback((next: ConversationView) => {
    setConversation((old) => mergeConversation(old, next, active.current));
  }, []);
  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof ClientError) {
        setMessage(error.message);
        if (
          ["SESSION_UNAVAILABLE", "CONVERSATION_UNAVAILABLE"].includes(
            error.detail.code,
          )
        ) {
          setState("unavailable");
          return;
        }
        if (
          error.detail.operation_state === "not_accepted" &&
          error.detail.recovery.action === "edit_request"
        ) {
          setState("ready");
          save({ conversation_id: active.current });
          return;
        }
      } else
        setMessage(
          "We couldn't confirm the saved state. Check again before trying another attempt.",
        );
      setState("unknown");
    },
    [save],
  );
  const check = useCallback(async () => {
    const id = active.current;
    if (!id) return;
    try {
      const c = await api(`conversations/${id}`, conversationSchema);
      adopt(c);
      const pending = marker.current;
      if (pending.submission_id) {
        const result = await api(
          `conversations/${id}/submissions/${pending.submission_id}`,
          lookupSchema,
        );
        if (!result.recorded) {
          setNotRecorded(true);
          setMessage(
            pendingText.current
              ? "This question was not recorded. You can resend the same question."
              : "This question was not recorded. Its unsent text was not saved; dismiss this request and re-enter it.",
          );
          setState("unknown");
          return;
        }
      }
      const retryTurn = pending.turn_id
        ? c.turns.find((t) => t.id === pending.turn_id)
        : undefined;
      if (
        pending.client_attempt_id &&
        retryTurn?.current_attempt.client_attempt_id !==
          pending.client_attempt_id &&
        retryTurn?.status === "failed"
      ) {
        setNotRecorded(true);
        setMessage(
          "The retry is not confirmed. You can repeat the same retry request.",
        );
        setState("unknown");
        return;
      }
      if (c.active_turn_id) {
        setState("waiting");
        setMessage("Preparing a scripted response…");
      } else {
        save({ conversation_id: id });
        pendingText.current = "";
        setNotRecorded(false);
        setState("ready");
        setMessage("");
        setDraft("");
      }
    } catch (error) {
      handleError(error);
    }
  }, [adopt, handleError, save]);
  const newChat = useCallback(async () => {
    setState("loading");
    setMessage("");
    try {
      let s = await api("session", sessionSchema, undefined, {});
      s = await api("session", sessionSchema);
      setSession(s);
      const creation = marker.current.creation_id ?? crypto.randomUUID();
      save({ creation_id: creation });
      const c = await api("conversations", conversationSchema, s.csrf_token, {
        client_conversation_id: creation,
      });
      active.current = c.id;
      save({ conversation_id: c.id });
      setConversation(c);
      setDraft("");
      setState("ready");
    } catch (error) {
      handleError(error);
    }
  }, [handleError, save]);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    void (async () => {
      try {
        const stored = sessionStorage.getItem("nutribite.recovery.v1");
        if (stored)
          marker.current = markerSchema.parse(JSON.parse(stored) as unknown);
      } catch {
        setStorageWarning(true);
      }
      if (marker.current.conversation_id) {
        active.current = marker.current.conversation_id;
        try {
          setSession(await api("session", sessionSchema));
          await check();
        } catch (error) {
          handleError(error);
        }
      } else await newChat();
    })();
  }, [check, handleError, newChat]);
  useEffect(() => {
    if (state !== "waiting") {
      pollStarted.current = 0;
      return;
    }
    if (!pollStarted.current) pollStarted.current = Date.now();
    const elapsed = Date.now() - pollStarted.current;
    if (elapsed > 70000) {
      setState("unknown");
      setMessage("The answer is still unresolved. Check again.");
      return;
    }
    const timer = setTimeout(
      () => {
        void check();
      },
      elapsed < 10000 ? 2000 : 5000,
    );
    return () => clearTimeout(timer);
  }, [state, conversation, check]);
  async function send(repeat = false) {
    if (!session || !active.current) return;
    const question = repeat ? pendingText.current : draft;
    if (
      !question.trim() ||
      [...normalize(question)].length > session.limits.question_max_code_points
    ) {
      setMessage("Enter a question within the displayed limit.");
      return;
    }
    const id = repeat ? marker.current.submission_id : crypto.randomUUID();
    if (!id) return;
    save({ conversation_id: active.current, submission_id: id });
    pendingText.current = question;
    setState("waiting");
    setMessage("Preparing a scripted response…");
    setNotRecorded(false);
    try {
      await api(
        `conversations/${active.current}/turns`,
        operationSchema,
        session.csrf_token,
        { client_submission_id: id, question },
      );
      await check();
    } catch (error) {
      handleError(error);
      if (
        error instanceof ClientError &&
        error.detail.operation_state === "accepted"
      )
        await check();
    }
  }
  async function retry(turnId: string, failedId: string, repeat = false) {
    if (!session) return;
    const id = repeat ? marker.current.client_attempt_id : crypto.randomUUID();
    if (!id) return;
    save({
      conversation_id: active.current,
      turn_id: turnId,
      client_attempt_id: id,
      failed_attempt_id: failedId,
    });
    setState("waiting");
    setMessage("Retrying the scripted response…");
    setNotRecorded(false);
    try {
      await api(
        `conversations/${active.current}/turns/${turnId}/attempts`,
        operationSchema,
        session.csrf_token,
        { client_attempt_id: id, failed_attempt_id: failedId },
      );
      await check();
    } catch (error) {
      handleError(error);
      if (
        error instanceof ClientError &&
        error.detail.operation_state === "accepted"
      )
        await check();
    }
  }
  const unresolved =
    state === "loading" || state === "waiting" || state === "unknown";
  const count = [...normalize(draft)].length;
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <span className={styles.badge}>LOCAL · SCRIPTED TEST MODE</span>
          <h1>Gusto NutriBite</h1>
          <p>Your personal AI nutrition companion</p>
        </div>
        <button
          className={styles.secondary}
          disabled={unresolved}
          onClick={() => {
            if (
              !draft ||
              window.confirm("Discard this unsent draft and start a new chat?")
            ) {
              save({});
              void newChat();
            }
          }}
        >
          New chat
        </button>
      </header>
      <div className={styles.layout}>
        <section className={styles.chat} aria-label="Conversation">
          <div
            className={styles.messages}
            aria-live="polite"
            aria-busy={state === "waiting"}
          >
            {!conversation?.turns.length && (
              <div className={styles.empty}>
                <h2>A small step toward better food conversations.</h2>
                <p>
                  This local foundation saves your questions and returns a
                  scripted test response. It does not provide nutrition advice
                  yet.
                </p>
              </div>
            )}
            {conversation?.turns.map((t) => (
              <div key={t.id}>
                <article className={`${styles.message} ${styles.user}`}>
                  <span className={styles.label}>You</span>
                  {t.user_message.text}
                </article>
                {t.assistant_message && (
                  <article className={`${styles.message} ${styles.assistant}`}>
                    <span className={styles.label}>
                      Gusto · scripted response
                    </span>
                    {t.assistant_message.content.answer}
                  </article>
                )}
                {t.failure && (
                  <div className={styles.status}>
                    <p>{t.failure.message}</p>
                    {t.retry.allowed && (
                      <button
                        disabled={unresolved}
                        onClick={() => {
                          void retry(t.id, t.current_attempt.id);
                        }}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {pendingText.current &&
              !conversation?.turns.some(
                (t) => t.client_submission_id === marker.current.submission_id,
              ) && (
                <article className={`${styles.message} ${styles.user}`}>
                  <span className={styles.label}>
                    You · pending confirmation
                  </span>
                  {pendingText.current}
                </article>
              )}
          </div>
          {(message || state === "loading") && (
            <div className={styles.status} role="status">
              {message || "Loading your saved chat…"}
              {state === "unknown" && (
                <button
                  onClick={() => {
                    if (active.current) void check();
                    else void newChat();
                  }}
                >
                  Check again
                </button>
              )}
              {notRecorded && (
                <button
                  onClick={() => {
                    if (
                      marker.current.client_attempt_id &&
                      marker.current.turn_id &&
                      marker.current.failed_attempt_id
                    )
                      void retry(
                        marker.current.turn_id,
                        marker.current.failed_attempt_id,
                        true,
                      );
                    else if (pendingText.current) void send(true);
                    else {
                      save({ conversation_id: active.current });
                      setState("ready");
                      setMessage("");
                      setNotRecorded(false);
                    }
                  }}
                >
                  {pendingText.current || marker.current.client_attempt_id
                    ? "Repeat request"
                    : "Dismiss unsent request"}
                </button>
              )}
            </div>
          )}
          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="question">Your question</label>
            <textarea
              id="question"
              value={draft}
              disabled={state !== "ready"}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Try a question to test saving and refresh recovery"
              aria-describedby="question-limit"
            />
            <div className={styles.actions}>
              <small id="question-limit">
                {count} / {session?.limits.question_max_code_points ?? "…"}{" "}
                characters
              </small>
              <button
                disabled={
                  state !== "ready" ||
                  !normalize(draft) ||
                  count > (session?.limits.question_max_code_points ?? 0)
                }
                type="submit"
              >
                Send
              </button>
            </div>
          </form>
          <p className={styles.privacy}>
            Questions are stored in this project's local PostgreSQL database.
            Session access lasts seven days; expired or revoked data is removed
            automatically within 24 hours while the app runs. New chat does not
            delete history. Please avoid personal or medical details.
          </p>
          {storageWarning && (
            <p role="status" className={styles.error}>
              Browser recovery storage is unavailable. Refresh recovery may be
              limited.
            </p>
          )}
        </section>
        <aside className={styles.sources} aria-labelledby="sources-title">
          <h2 id="sources-title">Sources</h2>
          <p>No sources available in this version.</p>
          <hr />
          <p className={styles.notice}>
            Answers may be inaccurate. This version does not check sources.
          </p>
          <p>Phase 1 tests storage and recovery. No model calls are made.</p>
        </aside>
      </div>
    </main>
  );
}
