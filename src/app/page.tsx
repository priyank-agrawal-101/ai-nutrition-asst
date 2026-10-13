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
import { ChatWelcome } from "./chat-welcome";
import { ChatInfo } from "./chat-info";

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
  const [waitUntil, setWaitUntil] = useState(0),
    [clock, setClock] = useState(() => Date.now());
  const marker = useRef<Marker>({}),
    shell = useRef<HTMLElement>(null),
    active = useRef(""),
    mounted = useRef(false),
    pendingText = useRef(""),
    pollStarted = useRef(0),
    input = useRef<HTMLTextAreaElement>(null),
    messages = useRef<HTMLDivElement>(null),
    atBottom = useRef(true),
    dialog = useRef<HTMLDialogElement>(null);
  const fitInput = useCallback(() => {
    const textarea = input.current;
    if (!textarea) return;
    const line = Number.parseFloat(getComputedStyle(textarea).lineHeight);
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(line * 4, Math.max(line * 2, textarea.scrollHeight))}px`;
    if (
      shell.current?.dataset.short === "true" &&
      document.activeElement === textarea
    )
      textarea.closest("form")?.scrollIntoView({ block: "end" });
  }, []);
  useEffect(fitInput, [draft, fitInput]);
  useEffect(() => {
    const frame = shell.current;
    if (!frame) return;
    const viewport = window.visualViewport;
    const resize = () => {
      // Browser zoom uses CSS pixels; pinch zoom must not reshape the page.
      const height = viewport?.scale === 1 ? viewport.height : innerHeight;
      frame.style.setProperty("--app-height", `${height}px`);
      frame.dataset.short = String(height < 500);
      fitInput();
      if (document.activeElement === input.current && height < 500)
        input.current?.closest("form")?.scrollIntoView({ block: "end" });
    };
    window.addEventListener("resize", resize);
    viewport?.addEventListener("resize", resize);
    const visibility = () => {
      frame.dataset.paused = String(document.hidden);
    };
    document.addEventListener("visibilitychange", visibility);
    visibility();
    resize();
    return () => {
      window.removeEventListener("resize", resize);
      viewport?.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [fitInput]);
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
    (error: unknown, generationRequest = false) => {
      if (error instanceof ClientError) {
        setMessage(error.message);
        if (error.detail.recovery.retry_after_seconds) {
          setClock(Date.now());
          setWaitUntil(
            Date.now() + error.detail.recovery.retry_after_seconds * 1000,
          );
        }
        if (
          generationRequest &&
          error.detail.operation_state === "not_accepted" &&
          [
            "RATE_LIMITED",
            "PROVIDER_RATE_LIMITED",
            "PROVIDER_CAPACITY_EXCEEDED",
          ].includes(error.detail.code)
        ) {
          setState("ready");
          setNotRecorded(false);
          return;
        }
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
      setSession(await api("session", sessionSchema));
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
        setMessage("Preparing an answer…");
      } else {
        save({ conversation_id: id });
        pendingText.current = "";
        setNotRecorded(false);
        setState("ready");
        setMessage(
          pending.submission_id || pending.client_attempt_id
            ? c.turns.find((t) =>
                pending.submission_id
                  ? t.client_submission_id === pending.submission_id
                  : t.id === pending.turn_id,
              )?.status === "completed"
              ? "Response ready."
              : "Your question is saved, but no answer is ready. See the request status above."
            : "",
        );
        if (pending.submission_id || pending.client_attempt_id) setDraft("");
      }
    } catch (error) {
      handleError(error);
    }
  }, [adopt, handleError, save]);
  const newChat = useCallback(
    async (restore = false) => {
      setState("loading");
      setMessage("");
      try {
        let s = await api("session", sessionSchema, undefined, {});
        s = await api("session", sessionSchema);
        setSession(s);
        if (restore && s.latest_conversation_id) {
          active.current = s.latest_conversation_id;
          save({ conversation_id: s.latest_conversation_id });
          await check();
          return;
        }
        const creation = marker.current.creation_id ?? crypto.randomUUID();
        save({
          ...(active.current ? { conversation_id: active.current } : {}),
          creation_id: creation,
        });
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
    },
    [check, handleError, save],
  );
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
      if (marker.current.creation_id) await newChat();
      else if (marker.current.conversation_id) {
        active.current = marker.current.conversation_id;
        await check();
      } else await newChat(true);
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
    if (cooling) return;
    if (!session || !active.current || (!repeat && state !== "ready")) return;
    const question = repeat ? pendingText.current : draft;
    if (
      !question.trim() ||
      [...normalize(question)].length > session.limits.question_max_code_points
    ) {
      setMessage(
        !question.trim()
          ? "Enter a question."
          : `Shorten your question to ${session.limits.question_max_code_points} characters.`,
      );
      input.current?.focus();
      return;
    }
    const id =
      repeat ||
      (marker.current.submission_id && pendingText.current === question)
        ? marker.current.submission_id
        : crypto.randomUUID();
    if (!id) return;
    save({ conversation_id: active.current, submission_id: id });
    pendingText.current = question;
    setState("waiting");
    setMessage("Preparing an answer…");
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
      handleError(error, true);
      if (
        error instanceof ClientError &&
        error.detail.operation_state === "accepted"
      )
        await check();
    }
  }
  async function retry(turnId: string, failedId: string, repeat = false) {
    if (cooling) return;
    if (!session) return;
    const id =
      repeat ||
      (marker.current.turn_id === turnId &&
        marker.current.failed_attempt_id === failedId &&
        marker.current.client_attempt_id)
        ? marker.current.client_attempt_id
        : crypto.randomUUID();
    if (!id) return;
    save({
      conversation_id: active.current,
      turn_id: turnId,
      client_attempt_id: id,
      failed_attempt_id: failedId,
    });
    setState("waiting");
    setMessage("Preparing an answer…");
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
      handleError(error, true);
      if (
        error instanceof ClientError &&
        error.detail.operation_state === "accepted"
      )
        await check();
    }
  }
  useEffect(() => {
    if (messages.current && atBottom.current)
      messages.current.scrollTop = messages.current.scrollHeight;
  }, [conversation, state]);
  const scripted = session?.provider_mode !== "groq";
  const savedWait = Math.max(
    0,
    ...(conversation?.turns.map((t) =>
      t.failure?.retry_at ? Date.parse(t.failure.retry_at) : 0,
    ) ?? []),
  );
  const cooldownEnd = Math.max(waitUntil, savedWait);
  const cooling = cooldownEnd > clock;
  useEffect(() => {
    if (cooldownEnd <= Date.now()) {
      setClock(Date.now());
      return;
    }
    const timer = setInterval(() => {
      setClock(Date.now());
      if (Date.now() >= cooldownEnd) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownEnd]);
  const unresolved =
    state === "loading" || state === "waiting" || state === "unknown";
  const count = [...normalize(draft)].length;
  return (
    <main className={styles.shell} ref={shell}>
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path
                d="M5 16H27C26 24 21 27 16 27C11 27 6 24 5 16Z"
                fill="currentColor"
              />
              <path
                d="M16 12C9 13 7 9 8 5C14 4 17 7 16 12ZM17 12C17 6 21 4 25 6C25 11 22 13 17 12Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <div>
            <h1>
              Gusto <span>NutriBite</span>
            </h1>
            <p>Your personal AI nutrition companion</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <ChatInfo
            scripted={scripted}
            diagnostics={session?.diagnostics_enabled ?? false}
          />
          <button
            className={styles.secondary}
            disabled={unresolved}
            onClick={() => {
              if (draft) dialog.current?.showModal();
              else void newChat();
            }}
          >
            <span aria-hidden="true">+</span> New chat
          </button>
        </div>
      </header>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="discard-title"
      >
        <h2 id="discard-title">Start a new chat?</h2>
        <p>
          Your unsent draft will be discarded. Saved conversations are kept
          until automatic expiry.
        </p>
        <button autoFocus onClick={() => dialog.current?.close()}>
          Keep editing
        </button>
        <button
          onClick={() => {
            dialog.current?.close();
            void newChat();
          }}
        >
          Discard and start
        </button>
      </dialog>
      <div className={styles.layout}>
        <section className={styles.chat} aria-label="Conversation">
          <div className={styles.chatHeading}>
            <span>
              {conversation?.turns.length
                ? "Your conversation"
                : "Let’s dig in"}
            </span>
            {state === "ready" &&
              conversation?.turn_count === 0 &&
              session?.latest_conversation_id &&
              session.latest_conversation_id !== conversation.id && (
                <button
                  className={styles.infoButton}
                  disabled={!!draft.trim()}
                  onClick={() => {
                    const savedId = session.latest_conversation_id;
                    if (!savedId) return;
                    active.current = savedId;
                    save({ conversation_id: active.current });
                    setState("loading");
                    setMessage("");
                    void check();
                  }}
                >
                  Resume last saved chat
                </button>
              )}
            {scripted && (
              <span className={styles.badge}>Scripted test mode</span>
            )}
          </div>
          <div
            className={styles.messages}
            ref={messages}
            tabIndex={0}
            role="region"
            aria-label="Messages"
            onScroll={() => {
              const el = messages.current;
              if (el)
                atBottom.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            }}
          >
            {!conversation?.turns.length && !pendingText.current && (
              <ChatWelcome
                disabled={state !== "ready" || !!draft.trim()}
                onChoose={(question) => {
                  if (draft.trim()) {
                    input.current?.focus();
                    return;
                  }
                  setDraft(question);
                  input.current?.focus();
                  const composer = input.current?.closest("form");
                  if (
                    composer &&
                    !window.matchMedia("(prefers-reduced-motion: reduce)")
                      .matches
                  ) {
                    composer
                      .getAnimations()
                      .forEach((animation) => animation.cancel());
                    composer.animate(
                      [
                        { boxShadow: "0 0 0 3px #d7eee3, 0 0 0 0 #d7eee380" },
                        {
                          boxShadow:
                            "0 0 0 3px #e6ddf380, 0 0 0 12px #d7eee300",
                        },
                      ],
                      { duration: 650, easing: "ease-out" },
                    );
                  }
                }}
              />
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
                      {scripted ? "Gusto · scripted mode" : "Gusto"}
                      {t.assistant_message.kind === "refusal"
                        ? " · A boundary to keep in mind"
                        : t.assistant_message.kind === "clarification"
                          ? " · A quick question"
                          : ""}
                    </span>
                    {t.assistant_message.content.answer}
                    <details className={styles.claims}>
                      <summary>
                        Claims ({t.assistant_message.content.claims.length})
                      </summary>
                      {t.assistant_message.content.claims.length ? (
                        <ul>
                          {t.assistant_message.content.claims.map(
                            (claim, index) => (
                              <li key={index}>
                                <p>{claim.text}</p>
                                <small>
                                  Source:{" "}
                                  <code>{JSON.stringify(claim.source)}</code>
                                </small>
                              </li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p>No factual claims were included in this response.</p>
                      )}
                    </details>
                  </article>
                )}
                {t.failure && (
                  <div className={styles.status}>
                    <p>{t.failure.message}</p>
                    {t.retry.allowed && (
                      <button
                        disabled={unresolved || cooling}
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
            <div
              className={
                message === "Response ready." ||
                message.startsWith("Your question is saved,")
                  ? styles.srOnly
                  : styles.status
              }
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {state === "waiting" && (
                <span className={styles.thinking} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              )}
              {message || "Loading your saved chat…"}
              {state === "unknown" && (
                <button
                  onClick={() => {
                    if (marker.current.creation_id) void newChat();
                    else if (active.current) void check();
                    else void newChat(true);
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
          {!session?.generation_enabled && session && (
            <p role="status">
              Answers are paused by the operator. You can still read saved
              conversations.
            </p>
          )}
          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className={styles.srOnly} htmlFor="question">
              Your question
            </label>
            <textarea
              id="question"
              rows={2}
              ref={input}
              value={draft}
              disabled={state !== "ready"}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What’s on your mind (or your plate)?"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (state === "ready" && session?.generation_enabled)
                    void send();
                }
              }}
              aria-invalid={
                count > (session?.limits.question_max_code_points ?? 2000)
              }
              aria-describedby="question-limit question-help"
            />
            <div className={styles.actions}>
              <small id="question-limit">
                {count} / {session?.limits.question_max_code_points ?? "…"}{" "}
                characters
              </small>
              <button
                disabled={
                  state !== "ready" ||
                  cooling ||
                  !session?.generation_enabled ||
                  !normalize(draft) ||
                  count > (session?.limits.question_max_code_points ?? 0)
                }
                type="submit"
              >
                Send{" "}
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 19V5M6 11L12 5L18 11"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            {count > (session?.limits.question_max_code_points ?? 2000) && (
              <p className={styles.error} role="alert">
                Shorten your question to{" "}
                {session?.limits.question_max_code_points ?? 2000} characters.
              </p>
            )}
            <small id="question-help">
              <span className={styles.keyboardHint}>
                Enter to send · Shift+Enter for a new line.{" "}
              </span>
              {conversation?.turn_count ?? 0} /{" "}
              {session?.limits.conversation_max_turns ?? 20} questions in this
              chat.
            </small>
          </form>
          <div className={styles.footnotes}>
            <p>
              {scripted
                ? "Saved locally. Scripted mode makes no AI calls."
                : "Saved locally and sent to Groq. Avoid personal or medical details."}
              {session?.diagnostics_enabled &&
                " Private diagnostics on; details in About this chat."}
            </p>
            <p>
              Answers may be inaccurate. This version does not check sources.
            </p>
          </div>
          {storageWarning && (
            <p role="status" className={styles.error}>
              Browser tab storage is unavailable. Your most recent saved chat
              can still be restored while this browser session remains active.
            </p>
          )}
        </section>
        <aside className={styles.sources} aria-labelledby="sources-title">
          <h2 id="sources-title">Sources</h2>
          <p>No sources available in this version.</p>
        </aside>
      </div>
    </main>
  );
}
