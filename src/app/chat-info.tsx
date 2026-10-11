import { useRef } from "react";
import styles from "./chat.module.css";

export function ChatInfo({
  scripted,
  diagnostics,
}: {
  scripted: boolean;
  diagnostics: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        className={styles.infoButton}
        onClick={() => dialog.current?.showModal()}
      >
        About this chat
      </button>
      <dialog
        ref={dialog}
        className={`${styles.dialog} ${styles.infoDialog}`}
        aria-labelledby="about-title"
      >
        <div className={styles.infoHeading}>
          <h2 id="about-title">About this chat</h2>
          <button
            autoFocus
            className={styles.closeButton}
            onClick={() => dialog.current?.close()}
            aria-label="Close chat information"
          >
            ×
          </button>
        </div>
        <section className={styles.sources} aria-labelledby="sources-title">
          <h3 id="sources-title">Sources</h3>
          <p>No sources available in this version.</p>
          <p>Answers may be inaccurate. This version does not check sources.</p>
          <p>
            For general education. Calorie or weight targets and medical advice
            need a qualified professional.
          </p>
        </section>
        <section className={styles.infoSection} aria-labelledby="privacy-title">
          <h3 id="privacy-title">How this chat uses your data</h3>
          <p>
            {scripted
              ? "This chat is saved locally. Scripted mode makes no AI calls."
              : "This chat is saved locally and sent to Groq for AI responses."}{" "}
            Avoid personal or medical details.
          </p>
          <p>
            Questions and replies are saved in this project’s local database.
            Anyone using this browser profile may access this session. Access
            expires seven days after it starts; expired or revoked data is
            purged within 24 hours while the app runs, and cleanup resumes on
            startup. New chat does not delete history. Unsent drafts are not
            saved across refreshes.
          </p>
          {!scripted && (
            <p>
              Your full active conversation is sent to Groq for classification,
              generation, and review. Groq may retain content for reliability or
              abuse monitoring for up to 30 days unless your account has Zero
              Data Retention enabled; legal exceptions may apply. Account
              settings have not been independently verified. Avoid personal,
              medical, or identifying details.
            </p>
          )}
        </section>
        {diagnostics && (
          <section className={styles.infoSection}>
            <h3>Temporary diagnostics</h3>
            <p>
              Local diagnostics are on: rejected AI text and classification
              decisions may be retained privately for up to 24 hours. They are
              not shown as chat answers. Avoid sensitive details.
            </p>
          </section>
        )}
      </dialog>
    </>
  );
}
