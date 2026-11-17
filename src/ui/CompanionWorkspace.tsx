import { AlertCircle, Dumbbell, FolderCode, GraduationCap, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useTranslation } from "./i18n";
import {
  DEFAULT_COMPANION_PLUGIN_SETTINGS,
  type CompanionNewTaskInput,
  type CompanionPluginSettings,
  type CompanionProject,
  type CompanionTaskKind,
} from "../shared/companionTypes";
import { NewTaskDialog } from "./components/NewTaskDialog";
import { Spinner } from "./components/primitives";
import { TaskView } from "./components/TaskView";
import { PlanningView } from "./components/PlanningView";
import { PlanLog } from "./components/PlanLog";
import { useCompanion } from "./useCompanion";

/** Страница задачи справа. Список задач живёт на второй странице в левой колонке Koda. */
export function CompanionWorkspace() {
  const { t } = useTranslation();
  const active = true;
  const controller = useCompanion(active);
  const { api, task, selectedId, select, run, setTask } = controller;
  const [dialog, setDialog] = useState<CompanionTaskKind | null>(null);
  const [settings, setSettings] = useState<Partial<CompanionPluginSettings>>({});
  const [projects, setProjects] = useState<CompanionProject[]>([]);
  const pluginSettings = { ...DEFAULT_COMPANION_PLUGIN_SETTINGS, ...settings };

  useEffect(() => {
    void api.settings().then(setSettings, () => undefined);
    return api.onSettingsChanged(setSettings);
  }, [api]);

  useEffect(() => api.onOpenNew(({ kind }) => setDialog(kind)), [api]);

  useEffect(() => {
    // Список проектов перечитывается при каждом открытии диалога: его меняют в Koda.
    if (dialog) void api.projects().then(setProjects, () => undefined);
  }, [api, dialog]);

  const create = async (input: CompanionNewTaskInput) => {
    const created = await run("createTask", () => api.createTask(input));
    if (!created) return false;
    setTask(created);
    select(created.id);
    return true;
  };

  const renderBody = () => {
    if (!selectedId) {
      return (
        <div className="companion-empty">
          <GraduationCap size={28} />
          <strong>{t("companion.empty.title")}</strong>
          <span>{t("companion.empty.body")}</span>
          <div className="companion-empty-actions">
            <button type="button" className="primary-action" onClick={() => setDialog("project")}>
              <FolderCode size={14} />
              {t("companion.empty.newTask")}
            </button>
            <button type="button" className="ghost-button" onClick={() => setDialog("sandbox")}>
              <Dumbbell size={14} />
              {t("companion.empty.newExercise")}
            </button>
          </div>
        </div>
      );
    }
    if (!task) {
      return (
        <div className="companion-empty">
          <Spinner size={18} />
        </div>
      );
    }
    if (task.status === "planning") return <PlanningView controller={controller} task={task} />;
    if (task.status === "failed" || task.steps.length === 0) {
      return (
        <div className="companion-empty">
          <AlertCircle size={24} />
          <strong>{t("companion.failed.title")}</strong>
          {task.error && <span className="companion-error-text">{task.error}</span>}
          {task.planLog.length > 0 && <PlanLog task={task} />}
          <div className="companion-empty-actions">
            <button type="button" className="primary-action" onClick={() => void run("retryPlan", () => api.retryPlan(task.id))}>
              <RotateCcw size={14} />
              {t("companion.failed.retry")}
            </button>
            <button type="button" className="ghost-button" onClick={() => void run("deleteTask", () => api.deleteTask(task.id))}>
              <Trash2 size={14} />
              {t("companion.task.delete")}
            </button>
          </div>
        </div>
      );
    }
    return <TaskView key={task.id} controller={controller} task={task} settings={pluginSettings} active={active} />;
  };

  return (
    <div className="companion-workspace">
      <main className="canvas companion-main">
        <div className="canvas-drag" />
        {renderBody()}
      </main>
      {dialog && (
        <NewTaskDialog
          initialKind={dialog}
          loadModels={controller.loadModels}
          projects={projects}
          defaultProjectPath={projects[0]?.path ?? null}
          level={pluginSettings.level}
          involvement={pluginSettings.involvement}
          onCreate={create}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
