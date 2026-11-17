import clsx from "clsx";
import { Dumbbell, FolderCode, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useTranslation } from "../i18n";
import { useOverlayDismiss } from "../lib/useOverlayDismiss";
import type { CompanionProject } from "../../shared/companionTypes";
import {
  SANDBOX_INVOLVEMENT,
  type CompanionInvolvement,
  type CompanionLevel,
  type CompanionModels,
  type CompanionNewTaskInput,
  type CompanionTaskKind,
} from "../../shared/companionTypes";
import { ModelSelect, ModelsError, useModels } from "./AgentActivity";
import { InvolvementChoice, LevelChoice } from "./primitives";

const LANGUAGES = ["Python", "JavaScript", "TypeScript", "Go", "Rust", "Java", "Kotlin", "C#", "C++", "Swift", "PHP", "Ruby"];
const OTHER_LANGUAGE = "__other__";

export function NewTaskDialog({
  initialKind,
  projects,
  defaultProjectPath,
  level: initialLevel,
  involvement: initialInvolvement,
  loadModels,
  onCreate,
  onClose,
}: {
  loadModels: (projectPath: string | null) => Promise<CompanionModels>;
  initialKind: CompanionTaskKind;
  projects: CompanionProject[];
  defaultProjectPath: string | null;
  level: CompanionLevel;
  involvement: CompanionInvolvement;
  onCreate: (input: CompanionNewTaskInput) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState(initialKind);
  const [projectPath, setProjectPath] = useState(
    defaultProjectPath && projects.some((project) => project.path === defaultProjectPath)
      ? defaultProjectPath
      : (projects[0]?.path ?? ""),
  );
  const [goal, setGoal] = useState("");
  const [language, setLanguage] = useState("Python");
  const [level, setLevel] = useState(initialLevel);
  const [involvement, setInvolvement] = useState(initialInvolvement);
  const [pending, setPending] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const modelFolder = kind === "project" ? projectPath || null : null;
  const modelsState = useModels(loadModels, modelFolder);
  const models = modelsState.models;
  // Модель другой папки может здесь не найтись: тогда по умолчанию.
  useEffect(() => {
    if (models) setModel((current) => (current && models.models.some((item) => item.modelId === current) ? current : null));
  }, [models]);
  const overlay = useOverlayDismiss<HTMLDivElement>(() => !pending && onClose());
  const ready = goal.trim() !== "" && (kind === "sandbox" ? language.trim() !== "" : projectPath !== "");

  const submit = async () => {
    if (!ready || pending) return;
    setPending(true);
    try {
      const created = await onCreate({
        kind,
        projectPath: kind === "project" ? projectPath : null,
        goal: goal.trim(),
        language: kind === "sandbox" ? language.trim() : null,
        level,
        involvement: kind === "sandbox" ? SANDBOX_INVOLVEMENT : involvement,
        model,
      });
      if (created) onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="modal-overlay" {...overlay}>
      <form
        className="modal companion-dialog companion-new-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !pending) {
            event.stopPropagation();
            onClose();
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="modal-header">
          <div className="modal-title">
            <strong>{kind === "sandbox" ? t("companion.new.exerciseTitle") : t("companion.new.title")}</strong>
          </div>
          <button className="composer-icon" type="button" aria-label={t("companion.new.close")} disabled={pending} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="companion-kind-switch" role="tablist">
          {(["project", "sandbox"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              className={clsx("companion-kind", kind === value && "selected")}
              onClick={() => setKind(value)}
            >
              {value === "project" ? <FolderCode size={14} /> : <Dumbbell size={14} />}
              {value === "project" ? t("companion.new.kindProject") : t("companion.new.kindSandbox")}
            </button>
          ))}
        </div>
        {kind === "project" ? (
          <label className="field">
            <span>{t("companion.new.project")}</span>
            {projects.length ? (
              <select value={projectPath} onChange={(event) => setProjectPath(event.target.value)}>
                {projects.map((project) => (
                  <option key={project.path} value={project.path}>
                    {project.name}
                  </option>
                ))}
              </select>
            ) : (
              <small className="companion-field-hint">{t("companion.new.noProjects")}</small>
            )}
          </label>
        ) : (
          <label className="field">
            <span>{t("companion.new.language")}</span>
            <select
              value={LANGUAGES.includes(language) ? language : OTHER_LANGUAGE}
              onChange={(event) => setLanguage(event.target.value === OTHER_LANGUAGE ? "" : event.target.value)}
            >
              {LANGUAGES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
              <option value={OTHER_LANGUAGE}>{t("companion.new.otherLanguage")}</option>
            </select>
            {!LANGUAGES.includes(language) && (
              <input
                autoFocus
                value={language}
                spellCheck={false}
                placeholder={t("companion.new.otherLanguagePlaceholder")}
                onChange={(event) => setLanguage(event.target.value)}
              />
            )}
          </label>
        )}
        <label className="field">
          <span>{kind === "sandbox" ? t("companion.new.topic") : t("companion.new.goal")}</span>
          <textarea
            autoFocus
            rows={3}
            value={goal}
            placeholder={kind === "sandbox" ? t("companion.new.topicPlaceholder") : t("companion.new.goalPlaceholder")}
            onChange={(event) => setGoal(event.target.value)}
          />
        </label>
        {kind === "sandbox" ? (
          <>
            <LevelChoice label={t("companion.new.difficulty")} difficulty value={level} onChange={setLevel} />
            <small className="companion-field-hint">{t("companion.new.sandboxMode")}</small>
          </>
        ) : (
          <>
            <LevelChoice label={t("companion.new.level")} value={level} onChange={setLevel} />
            <InvolvementChoice label={t("companion.new.involvement")} value={involvement} onChange={setInvolvement} />
          </>
        )}
        <label className="field">
          <span>{t("companion.model.label")}</span>
          <ModelSelect models={models} failed={!!modelsState.error} value={model} onChange={setModel} />
          <ModelsError state={modelsState} />
        </label>
        <div className="companion-dialog-actions">
          <button type="button" className="ghost-button" disabled={pending} onClick={onClose}>
            {t("companion.new.cancel")}
          </button>
          <button type="submit" className="primary-action" disabled={!ready || pending}>
            {pending && <Loader2 size={14} className="companion-spin" />}
            {t("companion.new.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
