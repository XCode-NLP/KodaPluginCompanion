import clsx from "clsx";
import { AlertCircle, CheckCircle2, Dumbbell, FolderCode, Plus } from "lucide-react";

import { useTranslation } from "../i18n";
import type { CompanionTaskKind, CompanionTaskSummary } from "../../shared/companionTypes";
import { Spinner } from "./primitives";

function TaskRow({ task, selected, onSelect }: { task: CompanionTaskSummary; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={clsx("nav-item companion-task-row", selected && "selected")}
      aria-current={selected ? "page" : undefined}
      onClick={onSelect}
    >
      {task.status === "planning" ? (
        <Spinner size={14} />
      ) : task.status === "failed" ? (
        <AlertCircle size={14} className="companion-task-failed" />
      ) : task.status === "done" ? (
        <CheckCircle2 size={14} className="companion-task-done" />
      ) : task.kind === "sandbox" ? (
        <Dumbbell size={14} />
      ) : (
        <FolderCode size={14} />
      )}
      <span className="companion-task-title">{task.title}</span>
      {task.stepCount > 0 && task.status !== "done" && (
        <span className="companion-task-progress">
          {t("companion.sidebar.progress", { done: task.doneCount, total: task.stepCount })}
        </span>
      )}
    </button>
  );
}

export function CompanionSidebar({
  tasks,
  selectedId,
  onSelect,
  onNew,
}: {
  tasks: CompanionTaskSummary[];
  selectedId: string | null;
  onSelect: (taskId: string) => void;
  onNew: (kind: CompanionTaskKind) => void;
}) {
  const { t } = useTranslation();
  const groups: { kind: CompanionTaskKind; label: string; items: CompanionTaskSummary[] }[] = [
    { kind: "project", label: t("companion.sidebar.projects"), items: tasks.filter((task) => task.kind === "project") },
    { kind: "sandbox", label: t("companion.sidebar.exercises"), items: tasks.filter((task) => task.kind === "sandbox") },
  ];
  return (
    <aside className="sidebar companion-sidebar">
      <div className="companion-new-buttons">
        <button type="button" className="nav-item" onClick={() => onNew("project")}>
          <Plus size={16} />
          <span>{t("companion.sidebar.new")}</span>
        </button>
        <button type="button" className="nav-item" onClick={() => onNew("sandbox")}>
          <Dumbbell size={16} />
          <span>{t("companion.sidebar.newExercise")}</span>
        </button>
      </div>
      <div className="sidebar-scroll companion-task-list">
        {tasks.length === 0 && <p className="companion-sidebar-empty">{t("companion.sidebar.empty")}</p>}
        {groups.map(
          (group) =>
            group.items.length > 0 && (
              <nav className="nav-group" key={group.kind} aria-label={group.label}>
                <div className="companion-group-label">{group.label}</div>
                {group.items.map((task) => (
                  <TaskRow key={task.id} task={task} selected={task.id === selectedId} onSelect={() => onSelect(task.id)} />
                ))}
              </nav>
            ),
        )}
      </div>
    </aside>
  );
}
