import type { CompanionStep, CompanionTask, CompanionTaskSummary } from "./companionTypes";

/** Шаг закрыт: сделан, пропущен или отдан агенту. */
export function isStepClosed(step: Pick<CompanionStep, "status">): boolean {
  return step.status === "done" || step.status === "skipped" || step.status === "agent";
}

export function summarizeTask(task: CompanionTask): CompanionTaskSummary {
  return {
    id: task.id,
    kind: task.kind,
    title: task.title,
    status: task.status,
    level: task.level,
    involvement: task.involvement,
    projectPath: task.projectPath,
    stepCount: task.steps.length,
    doneCount: task.steps.filter(isStepClosed).length,
    updatedAt: task.updatedAt,
  };
}

/** Файлы шага в порядке появления: сначала со слотами, потом остальные правки. */
export function stepFiles(step: Pick<CompanionStep, "slots" | "edits">): string[] {
  return [...new Set([...step.slots.map((slot) => slot.file), ...step.edits.map((edit) => edit.file)])];
}
