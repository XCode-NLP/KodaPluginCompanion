import clsx from "clsx";
import { Loader2, X } from "lucide-react";
import type { ReactNode } from "react";

import { useTranslation } from "../i18n";
import { useOverlayDismiss } from "../lib/useOverlayDismiss";
import {
  COMPANION_INVOLVEMENTS,
  COMPANION_LEVELS,
  type CompanionInvolvement,
  type CompanionLevel,
} from "../../shared/companionTypes";

export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="companion-spin" aria-hidden="true" />;
}

interface Choice<T extends string> {
  value: T;
  label: string;
  note: string;
}

/** Выбор из нескольких карточек с подписью: уровень и доля участия. */
export function ChoiceGroup<T extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: Choice<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="companion-choices" role="radiogroup" aria-label={label}>
        {choices.map((choice) => {
          const selected = choice.value === value;
          return (
            <button
              type="button"
              key={choice.value}
              role="radio"
              aria-checked={selected}
              className={clsx("companion-choice", selected && "selected")}
              onClick={() => onChange(choice.value)}
            >
              <strong>{choice.label}</strong>
              <small>{choice.note}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LevelChoice({
  value,
  label,
  difficulty,
  onChange,
}: {
  value: CompanionLevel;
  label: string;
  /** В упражнении уровень значит сложность задачи, а не опыт человека. */
  difficulty?: boolean;
  onChange: (value: CompanionLevel) => void;
}) {
  const { t } = useTranslation();
  const prefix = difficulty ? "companion.difficulty" : "companion.level";
  return (
    <ChoiceGroup
      label={label}
      value={value}
      onChange={onChange}
      choices={COMPANION_LEVELS.map((level) => ({
        value: level,
        label: t(`${prefix}.${level}`),
        note: t(`${prefix}.${level}Note`),
      }))}
    />
  );
}

export function InvolvementChoice({
  value,
  label,
  onChange,
}: {
  value: CompanionInvolvement;
  label: string;
  onChange: (value: CompanionInvolvement) => void;
}) {
  const { t } = useTranslation();
  return (
    <ChoiceGroup
      label={label}
      value={value}
      onChange={onChange}
      choices={COMPANION_INVOLVEMENTS.map((involvement) => ({
        value: involvement,
        label: t(`companion.involvement.${involvement}`),
        note: t(`companion.involvement.${involvement}Note`),
      }))}
    />
  );
}

/** Окно подтверждения в стиле приложения; Esc и щелчок мимо закрывают. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const overlay = useOverlayDismiss<HTMLDivElement>(onClose);
  return (
    <div className="modal-overlay" {...overlay}>
      <div
        className="modal companion-dialog"
        role="alertdialog"
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="modal-header">
          <div className="modal-title">
            <strong>{title}</strong>
          </div>
          <button className="composer-icon" type="button" aria-label={t("companion.new.close")} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <p className="companion-dialog-text">{message}</p>
        <div className="companion-dialog-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            {t("companion.new.cancel")}
          </button>
          <button
            type="button"
            autoFocus
            className={danger ? "danger-action" : "primary-action"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
