import clsx from "clsx";
import { AlertTriangle, FolderOpen, Lock, PartyPopper, Play, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useTranslation } from "../i18n";
import { useNotifications } from "../notifications";
import { companionPolicy } from "../../shared/companionPolicy";
import { isStepClosed } from "../../shared/companionTasks";
import type { CompanionPluginSettings, CompanionRunResult, CompanionStepOutcome, CompanionTask } from "../../shared/companionTypes";
import type { CompanionController } from "../useCompanion";
import { useStepEditor } from "../useStepEditor";
import { ConfirmDialog, Spinner } from "./primitives";
import { StepPanel } from "./StepPanel";
import { ModelSelect, UsageLabel } from "./AgentActivity";
import { PlanLog } from "./PlanLog";
import { useTaskModels } from "./PlanningView";
import { sumUsage } from "../../shared/companionUsage";

type Confirm = { kind: "reveal" } | { kind: "delete" } | null;

export function TaskView({
  controller,
  task,
  settings,
  active,
}: {
  controller: CompanionController;
  task: CompanionTask;
  settings: CompanionPluginSettings;
  active: boolean;
}) {
  const { t } = useTranslation();
  const { notifyError } = useNotifications();
  const { api, run, setTask, busy, progress, activities, liveUsage } = controller;
  const models = useTaskModels(controller, task);
  const changeModel = async (model: string | null) => {
    const next = await run("setModel", () => api.setModel(task.id, model));
    if (next) setTask(next);
  };
  const [confirm, setConfirm] = useState<Confirm>(null);
  const policy = companionPolicy(task.level, task.involvement);
  const step = task.steps[task.currentStep] ?? null;
  const editor = useStepEditor({
    api,
    task,
    step,
    locked: policy.lockOutsideSlots,
    syntaxCheck: settings.backgroundSyntaxCheck,
    onTask: setTask,
    onError: (error, title) => notifyError(error, { title }),
  });

  const complete = useCallback(
    async (outcome: CompanionStepOutcome) => {
      if (!step) return;
      await editor.flush();
      const next = await run("completeStep", () => api.completeStep(task.id, step.id, outcome));
      if (next) setTask(next);
    },
    [api, editor, run, setTask, step, task.id],
  );

  const goTo = useCallback(
    async (index: number) => {
      await editor.flush();
      const next = await run("setCurrentStep", () => api.setCurrentStep(task.id, index));
      if (next) setTask(next);
    },
    [api, editor, run, setTask, task.id],
  );

  const check = useCallback(async () => {
    if (!step || busy) return;
    await editor.flush();
    await run("review", () => api.review(task.id, step.id, editor.slotCodes()), t("companion.toast.reviewFailed"));
  }, [api, busy, editor, run, step, t, task.id]);

  const hint = useCallback(
    async (slotId: string | null) => {
      if (!step) return;
      await editor.flush();
      await run("hint", () => api.hint(task.id, step.id, slotId, editor.slotCodes()), t("companion.toast.hintFailed"));
    },
    [api, editor, run, step, t, task.id],
  );

  const solve = useCallback(
    async (thenComplete: boolean) => {
      if (!step) return;
      const solution = await run("solution", () => api.solution(task.id, step.id));
      if (!solution) return;
      await editor.insertCode(solution.slots);
      if (thenComplete) await complete("agent");
    },
    [api, complete, editor, run, step, task.id],
  );

  const ask = useCallback(
    async (question: string) => {
      await editor.flush();
      return (await run("ask", () => api.ask(task.id, question, editor.slotCodes()), t("companion.toast.askFailed"))) !== null;
    },
    [api, editor, run, t, task.id],
  );

  const repair = useCallback(async () => {
    if (!step) return;
    const next = await run("repairStep", () => api.repairStep(task.id, step.id), t("companion.toast.repairFailed"));
    if (next) setTask(next);
  }, [api, run, setTask, step, t, task.id]);

  // ⌘↵ проверяет шаг, пока режим открыт. Фаза захвата: иначе редактор вставил бы пустую строку.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (document.querySelector(".modal-overlay")) return;
      event.preventDefault();
      event.stopPropagation();
      void check();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, check]);

  const sandbox = task.kind === "sandbox";
  const [runResult, setRunResult] = useState<CompanionRunResult | null>(null);
  const runCode = useCallback(async () => {
    const file = editor.activeFile;
    if (!file || busy) return;
    await editor.flush();
    const result = await run("runFile", () => api.runFile(task.id, file), t("companion.run.failed"));
    if (result) setRunResult(result);
  }, [api, busy, editor, run, t, task.id]);

  const allClosed = task.steps.every(isStepClosed);

  return (
    <div className="companion-task">
      <header className="companion-task-header">
        <div className="companion-task-heading">
          <h1>{task.title}</h1>
          <span className="companion-chip">
            {sandbox ? t(`companion.difficulty.${task.level}`) : t(`companion.level.${task.level}`)}
          </span>
          {!sandbox && <span className="companion-chip">{t(`companion.involvement.${task.involvement}`)}</span>}
          <ModelSelect
            className="companion-model-select compact"
            models={models.models}
            failed={!!models.error}
            value={task.model}
            disabled={busy !== null}
            onChange={(model) => void changeModel(model)}
          />
          {models.error && (
            <button type="button" className="companion-link" title={models.error} onClick={models.reload}>
              {t("companion.model.retry")}
            </button>
          )}
          {(task.usage.requests > 0 || liveUsage) && (
            <UsageLabel usage={liveUsage ? sumUsage(task.usage, liveUsage) : task.usage} plan={task.planUsage} />
          )}
        </div>
        <ol className="companion-steps-bar">
          {task.steps.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className={clsx("companion-step-dot", item.status, index === task.currentStep && "current")}
                title={`${index + 1}. ${item.title}`}
                aria-label={t("companion.task.goToStep", { index: index + 1 })}
                aria-current={index === task.currentStep ? "step" : undefined}
                onClick={() => index !== task.currentStep && void goTo(index)}
              />
            </li>
          ))}
        </ol>
        <div className="companion-task-tools">
          <button
            type="button"
            className="composer-icon"
            title={t("companion.task.openFolder")}
            aria-label={t("companion.task.openFolder")}
            onClick={() => void run("revealFolder", () => api.revealFolder(task.id))}
          >
            <FolderOpen size={15} />
          </button>
          <button
            type="button"
            className="composer-icon"
            title={t("companion.task.delete")}
            aria-label={t("companion.task.delete")}
            onClick={() => setConfirm({ kind: "delete" })}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      {allClosed && (
        <div className="companion-banner success">
          <PartyPopper size={15} />
          <strong>{t("companion.task.done")}</strong>
          <span>{t("companion.task.doneBody")}</span>
        </div>
      )}

      <div className="companion-body">
        <section className="companion-editor-column">
          <div className="companion-file-tabs" role="tablist">
            {editor.files.map((file) => (
              <button
                key={file}
                type="button"
                role="tab"
                aria-selected={file === editor.activeFile}
                className={clsx("companion-file-tab", file === editor.activeFile && "selected")}
                title={file}
                onClick={() => editor.openFile(file)}
              >
                {file.split("/").pop()}
              </button>
            ))}
            <span className="companion-save-status">
              {policy.lockOutsideSlots && step && step.slots.length > 0 && (
                <span className="companion-lock-note">
                  <Lock size={11} />
                  {t("companion.editor.locked")}
                </span>
              )}
              {editor.saveStatus === "saving" && t("companion.editor.saving")}
              {editor.saveStatus === "saved" && t("companion.editor.saved")}
            </span>
            {sandbox && editor.activeFile && (
              <button
                type="button"
                className="ghost-button companion-run-button"
                disabled={busy !== null}
                onClick={() => void runCode()}
              >
                {busy === "runFile" ? <Spinner size={13} /> : <Play size={13} />}
                {t("companion.run.button")}
              </button>
            )}
          </div>
          {editor.agentWroteFiles > 0 && (
            <div className="companion-banner info">
              <Sparkles size={14} />
              <span>{t("companion.editor.agentWrote", { count: editor.agentWroteFiles })}</span>
            </div>
          )}
          {editor.failedEdits.length > 0 && (
            <div className="companion-banner warning">
              <AlertTriangle size={14} />
              <span>{t("companion.editor.failedEdits")}</span>
              <button type="button" className="ghost-button" disabled={busy !== null} onClick={() => void repair()}>
                {busy === "repairStep" ? <Spinner size={13} /> : <Wand2 size={13} />}
                {t("companion.editor.repair")}
              </button>
            </div>
          )}
          {editor.lostSlots.length > 0 && (
            <div className="companion-banner warning">
              <AlertTriangle size={14} />
              <span>{t("companion.editor.lostSlots")}</span>
            </div>
          )}
          {editor.conflict && (
            <div className="companion-banner warning">
              <AlertTriangle size={14} />
              <span>{t("companion.editor.conflict", { path: editor.conflict })}</span>
              <button type="button" className="ghost-button" onClick={editor.reloadFromDisk}>
                {t("companion.editor.reload")}
              </button>
              <button type="button" className="ghost-button" onClick={() => void editor.overwriteDisk()}>
                {t("companion.editor.overwrite")}
              </button>
            </div>
          )}
          {editor.loadError && (
            <div className="companion-banner warning">
              <AlertTriangle size={14} />
              <span>{editor.loadError}</span>
            </div>
          )}
          <div className="companion-editor-wrap">
            {editor.loading && (
              <div className="companion-editor-loading">
                <Spinner />
                {t("companion.editor.loading")}
              </div>
            )}
            {!editor.loading && step && editor.files.length === 0 && !editor.failedEdits.length && (
              <div className="companion-editor-loading">{t("companion.editor.noFiles")}</div>
            )}
            <div className="companion-editor" ref={editor.containerRef} />
          </div>
          {sandbox && runResult && (
            <section className="companion-run-output" aria-label={t("companion.run.title")}>
              <header>
                <strong>{t("companion.run.title")}</strong>
                <code>{runResult.command}</code>
                <span className={clsx("companion-run-status", (runResult.timedOut || runResult.exitCode !== 0) && "failed")}>
                  {runResult.timedOut
                    ? t("companion.run.killed")
                    : t("companion.run.exit", {
                        code: String(runResult.exitCode ?? "—"),
                        seconds: (runResult.durationMs / 1000).toFixed(1),
                      })}
                </span>
                <button
                  type="button"
                  className="composer-icon"
                  aria-label={t("companion.run.close")}
                  title={t("companion.run.close")}
                  onClick={() => setRunResult(null)}
                >
                  <X size={13} />
                </button>
              </header>
              <pre>{runResult.output || t("companion.run.empty")}</pre>
              {runResult.truncated && <small>{t("companion.run.truncated")}</small>}
            </section>
          )}
        </section>

        {step && (
          <StepPanel
            step={step}
            index={task.currentStep}
            total={task.steps.length}
            policy={policy}
            messages={task.messages}
            filledSlots={editor.filledSlots}
            busy={busy}
            progress={progress}
            activities={activities}
            planLog={<PlanLog task={task} />}
            onFocusSlot={editor.focus}
            onCheck={() => void check()}
            onHint={(slotId) => void hint(slotId)}
            onReveal={() => (settings.confirmReveal ? setConfirm({ kind: "reveal" }) : void solve(false))}
            onLetAgent={() => void solve(true)}
            onSkip={() => void complete("skipped")}
            onDone={() =>
              isStepClosed(step) ? void goTo(Math.min(task.currentStep + 1, task.steps.length - 1)) : void complete("done")
            }
            onAsk={ask}
            onStop={() => void api.cancel(task.id)}
          />
        )}
      </div>

      {confirm?.kind === "reveal" && (
        <ConfirmDialog
          title={t("companion.step.reveal")}
          message={t("companion.step.revealConfirm")}
          confirmLabel={t("companion.step.reveal")}
          onConfirm={() => void solve(false)}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "delete" && (
        <ConfirmDialog
          title={t("companion.task.delete")}
          message={
            task.kind === "sandbox"
              ? t("companion.task.deleteSandboxConfirm", { title: task.title })
              : t("companion.task.deleteConfirm", { title: task.title })
          }
          confirmLabel={t("companion.task.delete")}
          danger
          onConfirm={() => void run("deleteTask", () => api.deleteTask(task.id))}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
