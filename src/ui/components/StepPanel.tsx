import clsx from "clsx";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Circle,
  CircleCheck,
  Eye,
  Lightbulb,
  MessageCircleQuestion,
  SendHorizontal,
  SkipForward,
  Square,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { useTranslation } from "../i18n";
import { MarkdownText } from "./MarkdownText";
import { canRevealSolution, nextHintRung, type CompanionPolicy } from "../../shared/companionPolicy";
import type {
  CompanionActivity,
  CompanionHint,
  CompanionMessage,
  CompanionReview,
  CompanionStep,
} from "../../shared/companionTypes";
import { ActivityFeed } from "./AgentActivity";
import { Spinner } from "./primitives";

function HintCard({ hint }: { hint: CompanionHint }) {
  const { t } = useTranslation();
  return (
    <div className="companion-hint">
      <span className="companion-hint-rung">
        <Lightbulb size={12} />
        {t(`companion.step.rung.${hint.rung}`)}
      </span>
      {hint.text && <MarkdownText text={hint.text} />}
      {hint.code && <MarkdownText text={"```\n" + hint.code + "\n```"} />}
    </div>
  );
}

function ReviewCard({ review, onJump }: { review: CompanionReview; onJump: (slotId: string) => void }) {
  const { t } = useTranslation();
  return (
    <section className={clsx("companion-review", `verdict-${review.verdict}`)} aria-live="polite">
      <strong className="companion-review-verdict">{t(`companion.review.${review.verdict}`)}</strong>
      {review.summary && <MarkdownText text={review.summary} />}
      {review.praise && <p className="companion-review-praise">{review.praise}</p>}
      {review.comments.length > 0 && (
        <ul className="companion-review-comments">
          {review.comments.map((comment, index) => (
            <li key={index} className={`severity-${comment.severity}`}>
              <MarkdownText text={comment.message} />
              {comment.suggestion && <MarkdownText text={"```\n" + comment.suggestion + "\n```"} />}
              {comment.slotId && (
                <button type="button" className="companion-link" onClick={() => onJump(comment.slotId!)}>
                  {t("companion.review.jump")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AskBox({
  messages,
  busy,
  onAsk,
}: {
  messages: CompanionMessage[];
  busy: boolean;
  onAsk: (question: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const send = async () => {
    const text = question.trim();
    if (!text || busy) return;
    if (await onAsk(text)) setQuestion("");
  };
  return (
    <section className="companion-ask">
      <h3>
        <MessageCircleQuestion size={14} />
        {t("companion.ask.title")}
      </h3>
      {messages.length > 0 && (
        <div className="companion-messages">
          {messages.slice(-6).map((message, index) => (
            <div key={index} className={clsx("companion-message", `from-${message.role}`)}>
              <span className="companion-message-author">
                {message.role === "user" ? t("companion.ask.you") : t("companion.ask.agent")}
              </span>
              <MarkdownText text={message.text} />
            </div>
          ))}
        </div>
      )}
      <div className="companion-ask-input">
        <textarea
          rows={2}
          value={question}
          placeholder={t("companion.ask.placeholder")}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          className="composer-icon"
          aria-label={t("companion.ask.send")}
          title={t("companion.ask.send")}
          disabled={!question.trim() || busy}
          onClick={() => void send()}
        >
          <SendHorizontal size={16} />
        </button>
      </div>
    </section>
  );
}

export interface StepPanelProps {
  step: CompanionStep;
  index: number;
  total: number;
  policy: CompanionPolicy;
  messages: CompanionMessage[];
  filledSlots: Set<string>;
  busy: string | null;
  progress: string | undefined;
  /** Этапы идущего запроса к агенту. */
  activities: CompanionActivity[];
  /** Журнал планирования задачи, над полем вопроса. */
  planLog: ReactNode;
  onFocusSlot: (slotId: string) => void;
  onCheck: () => void;
  onHint: (slotId: string | null) => void;
  onReveal: () => void;
  onLetAgent: () => void;
  onSkip: () => void;
  onDone: () => void;
  onAsk: (question: string) => Promise<boolean>;
  onStop: () => void;
}

/** Правая колонка: что делать на шаге, подсказки, проверка и вопросы агенту. */
export function StepPanel({
  step,
  index,
  total,
  policy,
  messages,
  filledSlots,
  busy,
  progress,
  activities,
  planLog,
  onFocusSlot,
  onCheck,
  onHint,
  onReveal,
  onLetAgent,
  onSkip,
  onDone,
  onAsk,
  onStop,
}: StepPanelProps) {
  const { t } = useTranslation();
  const [showStages, setShowStages] = useState(false);
  const working = busy !== null || progress !== undefined;
  const closed = step.status === "done" || step.status === "skipped" || step.status === "agent";
  const hintsFor = (slotId: string | null) => step.hints.filter((hint) => hint.slotId === slotId);
  const revealable = canRevealSolution(policy, step.hints.length);
  const hasSlots = step.slots.length > 0;
  return (
    <aside className="companion-step-panel">
      <div className="companion-step-scroll">
        <header className="companion-step-header">
          <span className="companion-step-counter">{t("companion.task.stepOf", { current: index + 1, total })}</span>
          <h2>{step.title}</h2>
          {closed && <span className={clsx("companion-step-status", step.status)}>{t(`companion.step.status.${step.status}`)}</span>}
        </header>
        {step.explanation && <MarkdownText className="companion-step-explanation" text={step.explanation} />}

        {hasSlots ? (
          <section className="companion-slots">
            <h3>{t("companion.step.slots")}</h3>
            {step.slots.map((slot) => {
              const hints = hintsFor(slot.id);
              const rung = nextHintRung(policy, hints.length);
              const filled = filledSlots.has(slot.id);
              return (
                <div key={slot.id} className="companion-slot-card">
                  <button type="button" className="companion-slot-head" onClick={() => onFocusSlot(slot.id)}>
                    {filled ? <CircleCheck size={14} className="companion-slot-filled" /> : <Circle size={14} />}
                    <span className="companion-slot-file">{slot.file}</span>
                    <span className="companion-slot-state">
                      {filled ? t("companion.step.slotFilled") : t("companion.step.slotEmpty")}
                    </span>
                  </button>
                  {slot.instruction && <MarkdownText className="companion-slot-instruction" text={slot.instruction} />}
                  {hints.map((hint) => (
                    <HintCard key={hint.createdAt} hint={hint} />
                  ))}
                  {!closed && (
                    <button
                      type="button"
                      className="companion-hint-button"
                      disabled={working || !rung}
                      onClick={() => onHint(slot.id)}
                    >
                      <Lightbulb size={13} />
                      {rung ? t("companion.step.hint", { rung: t(`companion.step.rung.${rung}`) }) : t("companion.step.noMoreHints")}
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        ) : (
          <p className="companion-agent-step">
            <Bot size={14} />
            {t("companion.step.agentStep")}
          </p>
        )}

        {step.review && <ReviewCard review={step.review} onJump={onFocusSlot} />}

        {working && (
          <div className="companion-progress" role="status">
            <Spinner />
            <span>{progress || (busy === "review" ? t("companion.step.checking") : t("companion.step.thinking"))}</span>
            {activities.length > 0 && (
              <button type="button" className="companion-link" aria-expanded={showStages} onClick={() => setShowStages(!showStages)}>
                {showStages ? t("companion.activity.hide") : t("companion.activity.show")}
              </button>
            )}
            <button
              type="button"
              className="stop-action"
              title={t("companion.step.stop")}
              aria-label={t("companion.step.stop")}
              onClick={onStop}
            >
              <Square size={13} aria-hidden="true" />
            </button>
          </div>
        )}
        {working && showStages && <ActivityFeed activities={activities} live />}

        {planLog}

        <AskBox messages={messages} busy={working} onAsk={onAsk} />
      </div>

      <footer className="companion-step-actions">
        {hasSlots && !closed && (
          <>
            <button type="button" className="primary-action" disabled={working} onClick={onCheck}>
              <CheckCircle2 size={14} />
              {busy === "review" ? t("companion.step.checking") : t("companion.step.check")}
              <kbd>⌘↵</kbd>
            </button>
            <div className="companion-secondary-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={working || !revealable}
                title={revealable ? undefined : t("companion.step.revealLocked")}
                onClick={onReveal}
              >
                <Eye size={13} />
                {t("companion.step.reveal")}
              </button>
              <button type="button" className="ghost-button" disabled={working} onClick={onLetAgent}>
                <Bot size={13} />
                {t("companion.step.letAgent")}
              </button>
              <button type="button" className="ghost-button" disabled={working} onClick={onSkip}>
                <SkipForward size={13} />
                {t("companion.step.skip")}
              </button>
            </div>
          </>
        )}
        {(!hasSlots || step.review?.verdict === "ok" || closed) && index < total - 1 && (
          <button type="button" className="primary-action" disabled={working} onClick={onDone}>
            {t("companion.step.next")}
            <ArrowRight size={14} />
          </button>
        )}
        {hasSlots && !closed && step.review && step.review.verdict !== "ok" && (
          <button type="button" className="companion-link" disabled={working} onClick={onDone}>
            {t("companion.step.markDone")}
          </button>
        )}
        {(!hasSlots || step.review?.verdict === "ok") && !closed && index === total - 1 && (
          <button type="button" className="primary-action" disabled={working} onClick={onDone}>
            <CheckCircle2 size={14} />
            {t("companion.step.markDone")}
          </button>
        )}
      </footer>
    </aside>
  );
}
