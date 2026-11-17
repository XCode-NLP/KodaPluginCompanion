import type { PluginUiHost } from "@kodadev/desktop-plugin-sdk/ui";
import type {
  CompanionAgentProgressEvent,
  CompanionPluginApi,
  CompanionPluginSettings,
  CompanionProject,
  CompanionTaskChangedEvent,
  CompanionTaskKind,
} from "../shared/companionTypes";

/** API страницы: каждый метод это `kodaPlugin.call` в main-часть плагина. */
export interface CompanionPageApi extends CompanionPluginApi {
  settings(): Promise<Partial<CompanionPluginSettings>>;
  projects(): Promise<CompanionProject[]>;
  onSettingsChanged(listener: (settings: Partial<CompanionPluginSettings>) => void): () => void;
  /** Выбор задачи общий для страницы списка и страницы задачи. */
  select(taskId: string | null): Promise<void>;
  selection(): Promise<{ taskId: string | null }>;
  onSelected(listener: (event: { taskId: string | null }) => void): () => void;
  /** Кнопка в списке открывает окно новой задачи на странице задачи. */
  openNew(kind: CompanionTaskKind): Promise<void>;
  onOpenNew(listener: (event: { kind: CompanionTaskKind }) => void): () => void;
}

let current: CompanionPageApi | null = null;

export function companionApi(): CompanionPageApi {
  if (!current) throw new Error("The companion page is not connected");
  return current;
}

export function setCompanionApi(api: CompanionPageApi): void {
  current = api;
}

export function createCompanionApi(host: PluginUiHost): CompanionPageApi {
  const call =
    <R>(method: string) =>
    (...args: unknown[]) =>
      host.call<R>(method, { args });
  const on =
    <E>(event: string) =>
    (listener: (data: E) => void) =>
      host.on(event, (data) => listener(data as E));
  return {
    listTasks: call("listTasks"),
    getTask: call("getTask"),
    createTask: call("createTask"),
    retryPlan: call("retryPlan"),
    deleteTask: call("deleteTask"),
    readFile: call("readFile"),
    writeFile: call("writeFile"),
    saveAnchors: call("saveAnchors"),
    repairStep: call("repairStep"),
    setCurrentStep: call("setCurrentStep"),
    review: call("review"),
    hint: call("hint"),
    solution: call("solution"),
    completeStep: call("completeStep"),
    ask: call("askQuestion"),
    cancel: call("cancel"),
    revealFolder: call("revealFolder"),
    listModels: call("listModels"),
    setModel: call("setModel"),
    runFile: call("runFile"),
    settings: call("settings"),
    select: (taskId) => host.call("select", { taskId }),
    selection: () => host.call("selection"),
    onSelected: on<{ taskId: string | null }>("selected"),
    openNew: (kind) => host.call("openNew", { kind }),
    onOpenNew: on<{ kind: CompanionTaskKind }>("openNew"),
    projects: call("projects"),
    onTaskChanged: on<CompanionTaskChangedEvent>("task"),
    onAgentProgress: on<CompanionAgentProgressEvent>("progress"),
    onSettingsChanged: on<Partial<CompanionPluginSettings>>("settings"),
  };
}
