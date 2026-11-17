import type { Json, PluginContext } from "@kodadev/desktop-plugin-sdk";
import type { CompanionRunResult } from "../shared/companionTypes";
import { CompanionService, type CompanionAgentEvent } from "./companionService";
import { CompanionStore } from "./companionStore";

/**
 * Связка сервиса «Компаньона» с `ctx` плагина: main-часть в QuickJS. Задачи лежат в
 * `ctx.storage`, упражнения в песочницах плагина, агент работает в
 * read-only сессии `ctx.agent.openSession`. Страница зовёт методы сервиса
 * через `ctx.ui.handle` и слушает события `task` и `progress`.
 */

/** Методы, которые страница может вызвать; аргументы приходят массивом `args`. */
export const COMPANION_UI_METHODS = [
  "listTasks",
  "getTask",
  "createTask",
  "retryPlan",
  "deleteTask",
  "readFile",
  "writeFile",
  "saveAnchors",
  "repairStep",
  "setCurrentStep",
  "review",
  "hint",
  "solution",
  "completeStep",
  "askQuestion",
  "cancel",
  "revealFolder",
  "listModels",
  "setModel",
  "runFile",
] as const satisfies readonly (keyof CompanionService)[];

/** Случайный id задачи без `crypto`: в QuickJS его нет. Он же имя песочницы. */
function newId(): string {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

export function createCompanionService(ctx: PluginContext): CompanionService {
  const store = new CompanionStore({
    get: (key) => ctx.storage.get(key),
    set: (key, value) => ctx.storage.set(key, value as Json),
    delete: (key) => ctx.storage.delete(key),
  });
  return new CompanionService({
    store,
    newId,
    language: () => ctx.env.language,
    publishTask: (taskId, task) => void ctx.ui.post("task", { taskId, task } as unknown as Json),
    publishProgress: (event) => void ctx.ui.post("progress", event as unknown as Json),
    host: {
      projects: () => ctx.projects.list(),
      createSandbox: (name) => ctx.sandboxes.create(name),
      removeSandbox: (name) => ctx.sandboxes.remove(name),
      readTextFile: (projectPath, relativePath) => ctx.projects.readTextFile(projectPath, relativePath),
      writeFile: (projectPath, relativePath, text, expectedHash) =>
        ctx.projects.writeFile(projectPath, relativePath, text, { expectedHash }),
      runFile: (projectPath, relativePath) => ctx.process.runFile(projectPath, relativePath) as Promise<CompanionRunResult>,
      reveal: (projectPath) => ctx.projects.reveal(projectPath),
      openSession: (sessionId, projectPath, model) => ctx.agent.openSession({ sessionId, projectPath, model }),
      prompt: (sessionId, preamble, request) =>
        ctx.agent.prompt({
          sessionId,
          preamble,
          prompt: request.prompt,
          outputSchema: request.outputSchema as Record<string, Json> | null,
          maxToolCalls: request.maxToolCalls,
          timeoutMs: request.timeoutMs,
        }),
      cancelSession: (sessionId) => ctx.agent.cancelSession(sessionId),
      closeSession: (sessionId) => ctx.agent.closeSession(sessionId),
      listModels: (projectPath) => ctx.agent.listModels(projectPath),
      onAgentEvent: (listener) => ctx.agent.onEvent((event) => listener(event as CompanionAgentEvent)),
    },
  });
}
