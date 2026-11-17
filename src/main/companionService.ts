import { t, type UiLanguage } from "../shared/i18n";
import { companionPolicy, nextHintRung, type CompanionPolicy } from "../shared/companionPolicy";
import {
  HINT_SCHEMA,
  PLAN_SCHEMA,
  REVIEW_SCHEMA,
  normalizeHint,
  normalizePlan,
  planSlotCount,
  normalizeRelativePath,
  normalizeRepairedEdits,
  normalizeReview,
} from "../shared/companionSchemas";
import {
  COMPANION_INVOLVEMENTS,
  COMPANION_LEVELS,
  SANDBOX_INVOLVEMENT,
  EMPTY_COMPANION_USAGE,
  type CompanionActivity,
  type CompanionModels,
  type CompanionUsage,
  type CompanionAgentProgressEvent,
  type CompanionFile,
  type CompanionHint,
  type CompanionMessage,
  type CompanionNewTaskInput,
  type CompanionReview,
  type CompanionRunResult,
  type CompanionSlotAnchor,
  type CompanionSlotCode,
  type CompanionSolution,
  type CompanionStep,
  type CompanionStepOutcome,
  type CompanionTask,
  type CompanionTaskSummary,
} from "../shared/companionTypes";
import { isStepClosed, stepFiles } from "../shared/companionTasks";
import { addModelUsage, mergeActivity, sumUsage, type CompanionModelUsage } from "../shared/companionUsage";
import {
  REPAIR_SCHEMA,
  askPrompt,
  hintPrompt,
  planPrompt,
  planRetryPrompt,
  repairPrompt,
  reviewPrompt,
  taskDigest,
  type FileForPrompt,
  type SlotForPrompt,
} from "./companionPrompts";
import type { CompanionStore, StoredCompanionTask } from "./companionStore";

/** Событие сессии агента, как его отдаёт `ctx.agent.onEvent`. */
export type CompanionAgentEvent =
  | { sessionId: string; type: "progress"; text: string }
  | { sessionId: string; type: "activity"; activity: CompanionActivity }
  | { sessionId: string; type: "usage"; usage: CompanionModelUsage };

export interface CompanionAgentRequest {
  prompt: string;
  /** JSON Schema ответа; null значит свободный текст. */
  outputSchema: Record<string, unknown> | null;
  timeoutMs: number;
  maxToolCalls: number;
}

/**
 * Всё, что сервис берёт у Koda: тонкая обёртка над `ctx` плагина. Пути
 * проверяет сам хост, а агент в сессии только читает.
 */
export interface CompanionHost {
  projects(): Promise<Array<{ path: string; name: string }>>;
  createSandbox(name: string): Promise<string>;
  removeSandbox(name: string): Promise<void>;
  readTextFile(projectPath: string, relativePath: string): Promise<{ text: string; hash: string | null }>;
  writeFile(projectPath: string, relativePath: string, text: string, expectedHash: string | null): Promise<{ hash: string }>;
  runFile(projectPath: string, relativePath: string): Promise<CompanionRunResult>;
  reveal(projectPath: string): Promise<void>;
  openSession(sessionId: string, projectPath: string, model: string | null): Promise<void>;
  prompt(sessionId: string, preamble: string, request: CompanionAgentRequest): Promise<{ text: string; value: unknown }>;
  cancelSession(sessionId: string): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  listModels(projectPath: string | null): Promise<CompanionModels>;
  onAgentEvent(listener: (event: CompanionAgentEvent) => void): void;
}

export interface CompanionServiceOptions {
  store: CompanionStore;
  host: CompanionHost;
  language: () => UiLanguage;
  publishTask: (taskId: string, task: CompanionTask | null) => void;
  publishProgress: (event: CompanionAgentProgressEvent) => void;
  newId: () => string;
  now?: () => number;
}

/** Так хост отвечает на `cancelSession`; по тексту отмена отличается от сбоя. */
const CANCELLED = "The agent request was cancelled";

function isCancelled(error: unknown): boolean {
  return error instanceof Error && error.message.includes(CANCELLED);
}

const RUNNABLE = new Set([".py", ".js", ".mjs", ".cjs", ".ts", ".mts", ".go", ".rb", ".php"]);

export function canRunFile(file: string): boolean {
  const dot = file.lastIndexOf(".");
  return dot > file.lastIndexOf("/") && RUNNABLE.has(file.slice(dot).toLowerCase());
}

const MAX_GOAL = 4_000;
const MAX_QUESTION = 4_000;
const MAX_SLOT_CODE = 40_000;
const MAX_MESSAGES = 100;
const PLAN_TIMEOUT = 15 * 60_000;
const REQUEST_TIMEOUT = 5 * 60_000;
const MAX_PLAN_LOG = 150;
const MAX_PLAN_LOG_TEXT = 2_000;
const MAX_MODEL_ID = 200;

function normalizeModel(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_MODEL_ID) : null;
}

/** Всё, что делает плагин: задачи, файлы и запросы к агенту. IPC только пробрасывает вызовы. */
export class CompanionService {
  /** Задачи, у которых открыта сессия агента. */
  private readonly sessions = new Set<string>();
  /** Слушатели событий идущего запроса, по задаче. */
  private readonly turns = new Map<string, (event: CompanionAgentEvent) => void>();
  private readonly now: () => number;

  constructor(private readonly options: CompanionServiceOptions) {
    this.now = options.now ?? Date.now;
    options.host.onAgentEvent((event) => this.turns.get(event.sessionId)?.(event));
  }

  async listTasks(): Promise<CompanionTaskSummary[]> {
    await this.options.store.load();
    return this.options.store.list();
  }

  async getTask(taskId: string): Promise<CompanionTask | null> {
    await this.options.store.load();
    return this.options.store.get(taskId)?.task ?? null;
  }

  async createTask(input: CompanionNewTaskInput): Promise<CompanionTask> {
    await this.options.store.load();
    const goal = typeof input?.goal === "string" ? input.goal.trim().slice(0, MAX_GOAL) : "";
    if (!goal) throw new Error(t("companion.error.emptyGoal"));
    if (!COMPANION_LEVELS.includes(input.level) || !COMPANION_INVOLVEMENTS.includes(input.involvement))
      throw new Error(t("companion.error.invalidInput"));
    const id = this.options.newId();
    const kind = input.kind === "sandbox" ? "sandbox" : "project";
    let projectPath: string;
    if (kind === "sandbox") {
      projectPath = await this.options.host.createSandbox(id);
    } else {
      projectPath = typeof input.projectPath === "string" ? input.projectPath : "";
      if (!(await this.options.host.projects()).some((project) => project.path === projectPath))
        throw new Error(t("companion.error.projectMissing"));
    }
    const language = kind === "sandbox" && typeof input.language === "string" ? input.language.trim().slice(0, 40) : "";
    const now = this.now();
    const task: CompanionTask = {
      id,
      kind,
      projectPath,
      title: goal.split("\n")[0].slice(0, 80),
      goal,
      language: language || null,
      level: input.level,
      involvement: kind === "sandbox" ? SANDBOX_INVOLVEMENT : input.involvement,
      status: "planning",
      error: null,
      steps: [],
      currentStep: 0,
      messages: [],
      model: normalizeModel(input.model),
      usage: EMPTY_COMPANION_USAGE,
      planUsage: EMPTY_COMPANION_USAGE,
      planLog: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.save({ task, solutions: {} });
    void this.plan(id);
    return task;
  }

  async retryPlan(taskId: string): Promise<CompanionTask> {
    const stored = this.require(taskId);
    if (stored.task.status === "planning") return stored.task;
    await this.save({
      task: { ...stored.task, status: "planning", error: null, steps: [], currentStep: 0, planLog: [], planUsage: EMPTY_COMPANION_USAGE },
      solutions: {},
    });
    void this.plan(taskId);
    return this.require(taskId).task;
  }

  async deleteTask(taskId: string): Promise<void> {
    const stored = this.options.store.get(taskId);
    await this.closeSession(taskId);
    await this.options.store.delete(taskId);
    if (stored?.task.kind === "sandbox") await this.options.host.removeSandbox(taskId).catch(() => undefined);
    this.options.publishTask(taskId, null);
  }

  async readFile(taskId: string, file: string): Promise<CompanionFile> {
    const relative = this.relative(file);
    const read = await this.options.host.readTextFile(this.require(taskId).task.projectPath, relative).catch((error) => {
      throw this.fileError(error, relative);
    });
    return { path: relative, ...read };
  }

  async writeFile(taskId: string, file: string, text: string, expectedHash: string | null): Promise<CompanionFile> {
    if (typeof text !== "string") throw new Error(t("companion.error.invalidInput"));
    const relative = this.relative(file);
    const { hash } = await this.options.host
      .writeFile(this.require(taskId).task.projectPath, relative, text, expectedHash ?? null)
      .catch((error) => {
        throw this.fileError(error, relative);
      });
    return { path: relative, text, hash };
  }

  async runFile(taskId: string, file: string): Promise<CompanionRunResult> {
    const task = this.require(taskId).task;
    if (task.kind !== "sandbox") throw new Error(t("companion.run.sandboxOnly"));
    const relative = this.relative(file);
    if (!canRunFile(relative)) throw new Error(t("companion.run.unsupported", { path: relative }));
    return this.options.host.runFile(task.projectPath, relative).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const missing = /^(\S+) is not installed/.exec(message);
      throw missing ? new Error(t("companion.run.missingRuntime", { command: missing[1] })) : error;
    });
  }

  revealFolder(taskId: string): Promise<void> {
    return this.options.host.reveal(this.require(taskId).task.projectPath);
  }

  async saveAnchors(taskId: string, stepId: string, anchors: CompanionSlotAnchor[], applied: boolean): Promise<CompanionTask> {
    const stored = this.require(taskId);
    const step = this.step(stored, stepId);
    const clean: CompanionSlotAnchor[] = [];
    for (const anchor of Array.isArray(anchors) ? anchors : []) {
      const slot = step.slots.find((item) => item.id === anchor?.slotId);
      if (!slot || clean.some((item) => item.slotId === slot.id)) continue;
      clean.push({
        slotId: slot.id,
        file: slot.file,
        before: typeof anchor.before === "string" ? anchor.before.slice(-400) : "",
        after: typeof anchor.after === "string" ? anchor.after.slice(0, 400) : "",
      });
    }
    return this.updateStep(stored, stepId, { anchors: clean, applied: step.applied || applied === true });
  }

  async repairStep(taskId: string, stepId: string): Promise<CompanionTask> {
    const stored = this.require(taskId);
    const step = this.step(stored, stepId);
    const reply = await this.ask(stored, {
      prompt: repairPrompt(step, step.edits),
      outputSchema: REPAIR_SCHEMA,
      timeoutMs: REQUEST_TIMEOUT,
      maxToolCalls: 20,
    });
    const edits = normalizeRepairedEdits(reply.value, step);
    return this.updateStep(this.require(taskId), stepId, { edits, applied: false, anchors: [] });
  }

  async setCurrentStep(taskId: string, index: number): Promise<CompanionTask> {
    const stored = this.require(taskId);
    if (!Number.isInteger(index) || index < 0 || index >= stored.task.steps.length) throw new Error(t("companion.error.invalidInput"));
    const steps = stored.task.steps.map((step, position) =>
      position === index && step.status === "pending" ? { ...step, status: "active" as const } : step,
    );
    await this.save({ ...stored, task: { ...stored.task, steps, currentStep: index, updatedAt: this.now() } });
    return this.require(taskId).task;
  }

  async review(taskId: string, stepId: string, codes: CompanionSlotCode[]): Promise<CompanionReview> {
    const stored = this.require(taskId);
    const step = this.step(stored, stepId);
    const policy = this.policy(stored.task);
    const slots = this.slotsForPrompt(stored, step, codes);
    const reply = await this.ask(stored, {
      prompt: reviewPrompt(step, slots, await this.readStepFiles(stored.task, step), policy),
      outputSchema: REVIEW_SCHEMA,
      timeoutMs: REQUEST_TIMEOUT,
      maxToolCalls: 15,
    });
    const review = normalizeReview(reply.value, new Map(step.slots.map((slot) => [slot.id, slot.file])), this.now());
    await this.updateStep(this.require(taskId), stepId, { review });
    return review;
  }

  async hint(taskId: string, stepId: string, slotId: string | null, codes: CompanionSlotCode[]): Promise<CompanionHint> {
    const stored = this.require(taskId);
    const step = this.step(stored, stepId);
    const slot = slotId ? step.slots.find((item) => item.id === slotId) : null;
    if (slotId && !slot) throw new Error(t("companion.error.invalidInput"));
    const targetId = slot?.id ?? null;
    const previous = step.hints.filter((hint) => hint.slotId === targetId);
    const rung = nextHintRung(this.policy(stored.task), previous.length);
    if (!rung) throw new Error(t("companion.error.noMoreHints"));
    const slots = this.slotsForPrompt(stored, step, codes);
    const reply = await this.ask(stored, {
      prompt: hintPrompt(
        step,
        slots.find((item) => item.id === targetId) ?? null,
        rung,
        previous.map((hint) => hint.text),
        slots,
      ),
      outputSchema: HINT_SCHEMA,
      timeoutMs: REQUEST_TIMEOUT,
      maxToolCalls: 10,
    });
    const hint = normalizeHint(reply.value, targetId, rung, this.now());
    const fresh = this.require(taskId);
    await this.updateStep(fresh, stepId, { hints: [...this.step(fresh, stepId).hints, hint] });
    return hint;
  }

  solution(taskId: string, stepId: string): CompanionSolution {
    const stored = this.require(taskId);
    const step = this.step(stored, stepId);
    const solutions = stored.solutions[step.id] ?? {};
    return { slots: step.slots.map((slot) => ({ slotId: slot.id, code: solutions[slot.id] ?? "" })) };
  }

  async completeStep(taskId: string, stepId: string, outcome: CompanionStepOutcome): Promise<CompanionTask> {
    const stored = this.require(taskId);
    const index = stored.task.steps.findIndex((step) => step.id === stepId);
    if (index < 0 || !["done", "skipped", "agent"].includes(outcome)) throw new Error(t("companion.error.invalidInput"));
    const steps = stored.task.steps.map((step) => (step.id === stepId ? { ...step, status: outcome } : step));
    const next = steps.findIndex((step, position) => position > index && (step.status === "pending" || step.status === "active"));
    const fallback = steps.findIndex((step) => step.status === "pending" || step.status === "active");
    const currentStep = next >= 0 ? next : fallback >= 0 ? fallback : index;
    if (steps[currentStep].status === "pending") steps[currentStep] = { ...steps[currentStep], status: "active" };
    const done = steps.every(isStepClosed);
    await this.save({
      ...stored,
      task: { ...stored.task, steps, currentStep, status: done ? "done" : "ready", updatedAt: this.now() },
    });
    return this.require(taskId).task;
  }

  async askQuestion(taskId: string, question: string, codes: CompanionSlotCode[]): Promise<CompanionMessage> {
    const stored = this.require(taskId);
    const text = typeof question === "string" ? question.trim().slice(0, MAX_QUESTION) : "";
    if (!text) throw new Error(t("companion.error.invalidInput"));
    const step = stored.task.steps[stored.task.currentStep] ?? null;
    const userMessage: CompanionMessage = { role: "user", text, createdAt: this.now() };
    await this.save({
      ...stored,
      task: { ...stored.task, messages: [...stored.task.messages, userMessage].slice(-MAX_MESSAGES), updatedAt: this.now() },
    });
    const reply = await this.ask(stored, {
      prompt: askPrompt(stored.task, step, text, step ? this.slotsForPrompt(stored, step, codes) : []),
      outputSchema: null,
      timeoutMs: REQUEST_TIMEOUT,
      maxToolCalls: 15,
    });
    const answer: CompanionMessage = { role: "agent", text: reply.text, createdAt: this.now() };
    const fresh = this.require(taskId);
    await this.save({
      ...fresh,
      task: { ...fresh.task, messages: [...fresh.task.messages, answer].slice(-MAX_MESSAGES), updatedAt: this.now() },
    });
    return answer;
  }

  async cancel(taskId: string): Promise<void> {
    if (this.sessions.has(taskId)) await this.options.host.cancelSession(taskId);
  }

  listModels(projectPath: string | null): Promise<CompanionModels> {
    return this.options.host.listModels(typeof projectPath === "string" && projectPath ? projectPath : null);
  }

  async setModel(taskId: string, model: string | null): Promise<CompanionTask> {
    const stored = this.require(taskId);
    const next = normalizeModel(model);
    if (next === stored.task.model) return stored.task;
    await this.save({ ...stored, task: { ...stored.task, model: next, updatedAt: this.now() } });
    // Открытая сессия меняет только модель: новый процесс поднимется со следующим запросом.
    if (this.sessions.has(taskId)) await this.options.host.openSession(taskId, stored.task.projectPath, next);
    return this.require(taskId).task;
  }

  /** Плагин выключают: процессы агентов закрываются, задачи остаются. */
  async dispose(): Promise<void> {
    await Promise.all([...this.sessions].map((taskId) => this.closeSession(taskId)));
    await this.options.store.flush();
  }

  private async closeSession(taskId: string): Promise<void> {
    if (!this.sessions.delete(taskId)) return;
    await this.options.host.closeSession(taskId).catch(() => undefined);
  }

  private relative(file: string): string {
    const relative = normalizeRelativePath(file);
    if (!relative) throw new Error(t("companion.error.invalidPath"));
    return relative;
  }

  /** Отказы хоста приходят по-английски: известные переводятся для пользователя. */
  private fileError(error: unknown, relative: string): Error {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("changed on disk") || message.includes("EEXIST"))
      return new Error(t("companion.error.changedOutside", { path: relative }));
    if (message.includes("larger than")) return new Error(t("companion.error.tooLarge", { path: relative }));
    if (message.includes("looks binary")) return new Error(t("companion.error.binary", { path: relative }));
    if (message.includes("not a file")) return new Error(t("companion.error.notFile", { path: relative }));
    if (message.includes("outside the project")) return new Error(t("companion.error.invalidPath"));
    if (message.includes("unknown project")) return new Error(t("companion.error.projectMissing"));
    return error instanceof Error ? error : new Error(message);
  }

  private async plan(taskId: string): Promise<void> {
    const stored = this.options.store.get(taskId);
    if (!stored) return;
    const policy = this.policy(stored.task);
    try {
      const reply = await this.ask(
        stored,
        {
          prompt: planPrompt(stored.task, policy, this.options.language()),
          outputSchema: PLAN_SCHEMA,
          timeoutMs: PLAN_TIMEOUT,
          maxToolCalls: 60,
        },
        "plan",
      );
      let plan = normalizePlan(reply.value, policy, () => this.options.newId());
      if (!planHasEnoughSlots(plan.steps)) {
        // Та же сессия: модель уже прочитала проект и правит свой план.
        const retry = await this.ask(
          stored,
          {
            prompt: planRetryPrompt(policy),
            outputSchema: PLAN_SCHEMA,
            timeoutMs: PLAN_TIMEOUT,
            maxToolCalls: 20,
          },
          "plan",
        );
        const second = normalizePlan(retry.value, policy, () => this.options.newId());
        if (planSlotCount(second.steps) >= planSlotCount(plan.steps)) plan = second;
        if (planSlotCount(plan.steps) === 0) throw new Error(t("companion.error.planNoSlots"));
      }
      const fresh = this.options.store.get(taskId);
      if (!fresh) return;
      await this.save({
        task: {
          ...fresh.task,
          title: plan.title || fresh.task.title,
          steps: plan.steps,
          currentStep: 0,
          status: "ready",
          error: null,
          updatedAt: this.now(),
        },
        solutions: plan.solutions,
      });
    } catch (error) {
      const fresh = this.options.store.get(taskId);
      if (!fresh) return;
      const message =
        isCancelled(error) ? t("companion.error.planCancelled") : error instanceof Error ? error.message : String(error);
      await this.save({ ...fresh, task: { ...fresh.task, status: "failed", error: message, updatedAt: this.now() } });
    }
  }

  private async ask(stored: StoredCompanionTask, request: CompanionAgentRequest, purpose: "plan" | "other" = "other") {
    const taskId = stored.task.id;
    const host = this.options.host;
    if (!this.sessions.has(taskId)) {
      await host.openSession(taskId, stored.task.projectPath, stored.task.model);
      this.sessions.add(taskId);
    }
    const current = this.options.store.get(taskId)?.task ?? stored.task;
    const preamble = taskDigest(current, this.policy(current), this.options.language());
    let usage: CompanionUsage = EMPTY_COMPANION_USAGE;
    let log: CompanionActivity[] = [];
    this.options.publishProgress({ taskId, text: "", reset: true });
    this.turns.set(taskId, (event) => {
      if (event.type === "progress") this.options.publishProgress({ taskId, text: event.text });
      else if (event.type === "activity") {
        log = mergeActivity(log, event.activity);
        const merged = log.find((item) => item.id === event.activity.id);
        if (merged) this.options.publishProgress({ taskId, text: "", activity: merged });
      } else {
        usage = addModelUsage(usage, event.usage);
        this.options.publishProgress({ taskId, text: "", usage });
      }
    });
    try {
      return await host.prompt(taskId, preamble, request);
    } finally {
      this.turns.delete(taskId);
      // Сначала токены в задачу, потом конец запроса: страница не посчитает их дважды.
      await this.recordUsage(taskId, usage, purpose === "plan" ? log : null);
      this.options.publishProgress({ taskId, text: null });
    }
  }

  /** Токены запроса идут в задачу; этапы планирования сохраняются в её журнал. */
  private async recordUsage(taskId: string, usage: CompanionUsage, planLog: CompanionActivity[] | null): Promise<void> {
    if (!usage.requests && !planLog?.length) return;
    const fresh = this.options.store.get(taskId);
    if (!fresh) return;
    const task = { ...fresh.task, usage: sumUsage(fresh.task.usage, usage) };
    if (planLog) {
      task.planUsage = sumUsage(task.planUsage, usage);
      const trimmed = planLog.map((item) => ({
        ...item,
        status: item.status === "running" ? ("done" as const) : item.status,
        text: item.text.slice(0, MAX_PLAN_LOG_TEXT),
      }));
      task.planLog = [...task.planLog, ...trimmed].slice(-MAX_PLAN_LOG);
    }
    await this.save({ ...fresh, task });
  }

  private policy(task: CompanionTask): CompanionPolicy {
    return companionPolicy(task.level, task.involvement);
  }

  private require(taskId: string): StoredCompanionTask {
    const stored = typeof taskId === "string" ? this.options.store.get(taskId) : null;
    if (!stored) throw new Error(t("companion.error.taskMissing"));
    return stored;
  }

  private step(stored: StoredCompanionTask, stepId: string): CompanionStep {
    const step = stored.task.steps.find((item) => item.id === stepId);
    if (!step) throw new Error(t("companion.error.invalidInput"));
    return step;
  }

  private slotsForPrompt(stored: StoredCompanionTask, step: CompanionStep, codes: CompanionSlotCode[]): SlotForPrompt[] {
    const byId = new Map<string, string>();
    for (const item of Array.isArray(codes) ? codes : []) {
      if (typeof item?.slotId === "string" && typeof item.code === "string") byId.set(item.slotId, item.code.slice(0, MAX_SLOT_CODE));
    }
    const solutions = stored.solutions[step.id] ?? {};
    return step.slots.map((slot) => ({
      id: slot.id,
      file: slot.file,
      instruction: slot.instruction,
      code: byId.get(slot.id) ?? "",
      solution: solutions[slot.id] ?? "",
    }));
  }

  private async readStepFiles(task: CompanionTask, step: CompanionStep): Promise<FileForPrompt[]> {
    const paths = stepFiles(step)
      .map((file) => normalizeRelativePath(file))
      .filter((file): file is string => !!file)
      .slice(0, 6);
    const result: FileForPrompt[] = [];
    for (const file of paths) {
      const read = await this.options.host.readTextFile(task.projectPath, file).catch(() => null);
      if (read?.hash) result.push({ path: file, text: read.text });
    }
    return result;
  }

  private async updateStep(stored: StoredCompanionTask, stepId: string, patch: Partial<CompanionStep>): Promise<CompanionTask> {
    const steps = stored.task.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step));
    await this.save({ ...stored, task: { ...stored.task, steps, updatedAt: this.now() } });
    return this.require(stored.task.id).task;
  }

  private async save(stored: StoredCompanionTask): Promise<void> {
    await this.options.store.save(stored);
    this.options.publishTask(stored.task.id, stored.task);
  }
}

/** Хотя бы половина шагов должна оставлять код пользователю, иначе план просим заново. */
function planHasEnoughSlots(steps: readonly { slots: readonly unknown[] }[]): boolean {
  const withSlots = steps.filter((step) => step.slots.length > 0).length;
  return withSlots > 0 && withSlots * 2 >= steps.length;
}
