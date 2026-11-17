import clsx from "clsx";
import { Brain, Check, ChevronRight, FileText, MessageSquare, Search, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useTranslation } from "../i18n";
import type { UiLanguage } from "../../shared/i18n";
import type { CompanionActivity, CompanionModels, CompanionUsage } from "../../shared/companionTypes";
import type { CompanionController } from "../useCompanion";
import { Spinner } from "./primitives";

/** «12,4 тыс.» / «12.4K»: токены коротко, точное число уходит в подсказку. */
export function formatTokens(value: number, language: UiLanguage): string {
  return new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function exactTokens(value: number, language: UiLanguage): string {
  return new Intl.NumberFormat(language).format(value);
}

function seconds(activity: CompanionActivity): string | null {
  if (!activity.finishedAt || !activity.startedAt) return null;
  const value = Math.max(0, Math.round((activity.finishedAt - activity.startedAt) / 1000));
  return value >= 1 ? `${value}s` : null;
}

function ToolIcon({ tool }: { tool: string | null }) {
  if (tool === "read") return <FileText size={13} />;
  if (tool === "search") return <Search size={13} />;
  return <Wrench size={13} />;
}

function ActivityRow({ activity, defaultOpen }: { activity: CompanionActivity; defaultOpen: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  const running = activity.status === "running";
  const duration = seconds(activity);

  if (activity.kind === "tool") {
    return (
      <li className={clsx("companion-activity", "tool", activity.status)}>
        <span className="companion-activity-icon">
          <ToolIcon tool={activity.tool} />
        </span>
        <span className="companion-activity-title">{activity.text || t("companion.activity.tool")}</span>
        <span className="companion-activity-state">
          {running ? <Spinner size={11} /> : activity.status === "failed" ? <X size={12} /> : <Check size={12} />}
        </span>
      </li>
    );
  }

  const thought = activity.kind === "thought";
  const label = thought
    ? running
      ? t("companion.activity.thinking")
      : duration
        ? t("companion.activity.thoughtFor", { duration })
        : t("companion.activity.thought")
    : t("companion.activity.answer");
  return (
    <li className={clsx("companion-activity", activity.kind, activity.status, open && "open")}>
      <button type="button" className="companion-activity-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="companion-activity-icon">{thought ? <Brain size={13} /> : <MessageSquare size={13} />}</span>
        <span className="companion-activity-title">{label}</span>
        {!open && <span className="companion-activity-preview">{activity.text}</span>}
        <ChevronRight size={12} className="companion-activity-chevron" />
      </button>
      {open && <p className="companion-activity-text">{activity.text}</p>}
    </li>
  );
}

/**
 * Этапы агента по порядку. Идущее рассуждение раскрыто, чтобы его было
 * видно по мере набора; законченные сворачиваются в строку.
 */
export function ActivityFeed({ activities, live }: { activities: CompanionActivity[]; live: boolean }) {
  const listRef = useRef<HTMLOListElement>(null);
  const last = activities[activities.length - 1];
  useEffect(() => {
    if (!live) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [live, activities.length, last?.text]);
  if (activities.length === 0) return null;
  return (
    <ol ref={listRef} className="companion-activity-feed">
      {activities.map((activity) => (
        <ActivityRow key={activity.id} activity={activity} defaultOpen={live && activity.status === "running" && activity.kind === "thought"} />
      ))}
    </ol>
  );
}

/** Сколько токенов ушло модели: коротко, с разбивкой в подсказке. */
export function UsageLabel({ usage, plan }: { usage: CompanionUsage; plan?: CompanionUsage }) {
  const { t, language } = useTranslation();
  const title = [
    t("companion.usage.input", { tokens: exactTokens(usage.inputTokens, language) }),
    t("companion.usage.requests", { count: usage.requests }),
    plan && plan.requests ? t("companion.usage.plan", { tokens: exactTokens(plan.inputTokens, language) }) : null,
    usage.maxTokens
      ? t("companion.usage.context", {
          used: exactTokens(usage.contextTokens, language),
          max: exactTokens(usage.maxTokens, language),
        })
      : null,
    t("companion.usage.outputMissing"),
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <span className="companion-usage" title={title}>
      {t("companion.usage.short", { tokens: formatTokens(usage.inputTokens, language) })}
    </span>
  );
}

/** Выбор модели агента; пустое значение значит модель по умолчанию. */
export function ModelSelect({
  models,
  value,
  disabled,
  onChange,
  className,
  failed,
}: {
  failed?: boolean;
  models: CompanionModels | null;
  value: string | null;
  disabled?: boolean;
  onChange: (model: string | null) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const list = models?.models ?? [];
  const defaultName = list.find((model) => model.modelId === models?.currentModelId)?.name ?? models?.currentModelId;
  const missing = value && !list.some((model) => model.modelId === value);
  const loading = models === null && !failed;
  return (
    <select
      className={className}
      value={value ?? ""}
      disabled={disabled || loading}
      aria-label={t("companion.model.label")}
      title={t("companion.model.label")}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">
        {loading
          ? t("companion.model.loading")
          : defaultName
            ? t("companion.model.default", { name: defaultName })
            : t("companion.model.defaultPlain")}
      </option>
      {list.map((model) => (
        <option key={model.modelId} value={model.modelId}>
          {model.name}
        </option>
      ))}
      {missing && <option value={value}>{value}</option>}
    </select>
  );
}

export interface ModelsState {
  models: CompanionModels | null;
  error: string | null;
  reload: () => void;
}

/** Модели папки (null: упражнение) с ошибкой и повтором: пустой список не должен выглядеть как успех. */
export function useModels(loadModels: CompanionController["loadModels"], folder: string | null): ModelsState {
  const [models, setModels] = useState<CompanionModels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setModels(null);
    setError(null);
    loadModels(folder).then(
      (value) => !cancelled && setModels(value),
      (reason: unknown) => !cancelled && setError(reason instanceof Error ? reason.message : String(reason)),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, folder, loadModels]);
  return { models, error, reload: () => setAttempt((value) => value + 1) };
}

export function ModelsError({ state }: { state: ModelsState }) {
  const { t } = useTranslation();
  if (!state.error) return null;
  return (
    <small className="companion-models-error">
      {t("companion.model.failed", { error: state.error })}{" "}
      <button type="button" className="companion-link" onClick={state.reload}>
        {t("companion.model.retry")}
      </button>
    </small>
  );
}
