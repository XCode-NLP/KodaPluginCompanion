import { Square } from "lucide-react";

import { useTranslation } from "../i18n";
import type { CompanionTask } from "../../shared/companionTypes";
import type { CompanionController } from "../useCompanion";
import { ActivityFeed, ModelSelect, UsageLabel, useModels, type ModelsState } from "./AgentActivity";
import { Spinner } from "./primitives";

/** Модели папки задачи: упражнение спрашивает их без проекта. */
export function useTaskModels(controller: CompanionController, task: CompanionTask): ModelsState {
  return useModels(controller.loadModels, task.kind === "sandbox" ? null : task.projectPath);
}

/** Экран планирования: этапы агента вживую, модель и потраченные токены. */
export function PlanningView({ controller, task }: { controller: CompanionController; task: CompanionTask }) {
  const { t } = useTranslation();
  const { api, activities, liveUsage, progress } = controller;
  const models = useTaskModels(controller, task);
  return (
    <div className="companion-planning">
      <header className="companion-planning-head">
        <Spinner size={18} />
        <div>
          <strong>{t("companion.planning.title")}</strong>
          <span>{task.kind === "sandbox" ? t("companion.planning.sandbox") : t("companion.planning.project")}</span>
        </div>
      </header>
      {activities.length > 0 ? (
        <ActivityFeed activities={activities} live />
      ) : (
        <p className="companion-planning-waiting">{progress || t("companion.planning.waiting")}</p>
      )}
      <footer className="companion-planning-foot">
        <ModelSelect
          className="companion-model-select compact"
          models={models.models}
          failed={!!models.error}
          value={task.model}
          // Процесс уже запущен с этой моделью: сменить её можно после плана.
          disabled
          onChange={() => undefined}
        />
        {liveUsage && <UsageLabel usage={liveUsage} />}
        <button
          type="button"
          className="stop-action"
          title={t("companion.planning.stop")}
          aria-label={t("companion.planning.stop")}
          onClick={() => void api.cancel(task.id)}
        >
          <Square size={13} aria-hidden="true" />
        </button>
      </footer>
    </div>
  );
}
