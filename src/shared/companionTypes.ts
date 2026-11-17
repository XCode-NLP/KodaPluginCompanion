/** Контракт плагина «Компаньон»: задачи, шаги, слоты, проверки и каналы `companion:*`. */

/** Насколько подробно агент объясняет и с какой ступени начинает подсказки. */
export type CompanionLevel = "novice" | "middle" | "senior";
/** Какую часть кода пишет пользователь: всё, ядро логики или пару строк. */
export type CompanionInvolvement = "all" | "part" | "minimal";
export type CompanionTaskKind = "project" | "sandbox";
export type CompanionTaskStatus = "planning" | "ready" | "done" | "failed";
/** `agent`: шаг закрыл агент по просьбе пользователя. */
export type CompanionStepStatus = "pending" | "active" | "done" | "skipped" | "agent";
export type CompanionVerdict = "ok" | "almost" | "wrong";
export type CompanionCommentSeverity = "hint" | "info" | "warning";
/** Ступени подсказок по возрастанию; решение целиком открывается отдельно. */
export type CompanionHintRung = "nudge" | "concept" | "pseudo" | "snippet";

export const COMPANION_LEVELS: readonly CompanionLevel[] = ["novice", "middle", "senior"];
export const COMPANION_INVOLVEMENTS: readonly CompanionInvolvement[] = ["all", "part", "minimal"];
export const COMPANION_HINT_RUNGS: readonly CompanionHintRung[] = ["nudge", "concept", "pseudo", "snippet"];

/**
 * Правка агента в файле: найти `find` и заменить на `replace`. В `replace`
 * маркеры `<<<SLOT:id>>>` отмечают места, где код пишет пользователь.
 * Пустой `find` дописывает в конец файла (или создаёт его).
 */
export interface CompanionEdit {
  file: string;
  find: string;
  replace: string;
}

/** Место, где код пишет пользователь. Эталон хранится только в main. */
export interface CompanionSlot {
  id: string;
  file: string;
  instruction: string;
  /** Короткая строка-призрак внутри пустого слота. */
  placeholder: string;
}

/** Где слот лежит в файле: текст вокруг него, чтобы найти его после правок снаружи. */
export interface CompanionSlotAnchor {
  slotId: string;
  file: string;
  before: string;
  after: string;
}

export interface CompanionHint {
  slotId: string | null;
  rung: CompanionHintRung;
  text: string;
  code: string | null;
  createdAt: number;
}

export interface CompanionReviewComment {
  slotId: string | null;
  file: string | null;
  /** Строка внутри слота, с 1; null значит слот целиком. */
  line: number | null;
  severity: CompanionCommentSeverity;
  message: string;
  suggestion: string | null;
}

export interface CompanionReview {
  verdict: CompanionVerdict;
  summary: string;
  praise: string | null;
  comments: CompanionReviewComment[];
  createdAt: number;
}

export interface CompanionStep {
  id: string;
  title: string;
  explanation: string;
  edits: CompanionEdit[];
  slots: CompanionSlot[];
  status: CompanionStepStatus;
  /** Правки агента уже вставлены в файлы. */
  applied: boolean;
  anchors: CompanionSlotAnchor[];
  hints: CompanionHint[];
  review: CompanionReview | null;
}

export interface CompanionMessage {
  role: "user" | "agent";
  text: string;
  createdAt: number;
}

/** Один этап работы агента: рассуждение, вызов инструмента или текст ответа. */
export interface CompanionActivity {
  id: string;
  kind: "thought" | "tool" | "text";
  /** Рассуждение или текст целиком; у инструмента его заголовок. */
  text: string;
  /** Вид инструмента из ACP (`read`, `search`…); у остальных null. */
  tool: string | null;
  status: "running" | "done" | "failed";
  startedAt: number;
  finishedAt: number | null;
}

/**
 * Токены, которые агент задачи отправил модели. CLI сообщает только вход
 * каждого запроса к модели (`context_usage_update` с `provider_usage`),
 * выход он не считает, поэтому здесь его нет.
 */
export interface CompanionUsage {
  inputTokens: number;
  /** Запросов к модели. */
  requests: number;
  /** Размер контекста последнего запроса и предел модели. */
  contextTokens: number;
  maxTokens: number | null;
  modelId: string | null;
}

export const EMPTY_COMPANION_USAGE: CompanionUsage = {
  inputTokens: 0,
  requests: 0,
  contextTokens: 0,
  maxTokens: null,
  modelId: null,
};

export interface CompanionTask {
  id: string;
  kind: CompanionTaskKind;
  /** Папка, в которой работает агент: проект или песочница упражнения. */
  projectPath: string;
  title: string;
  goal: string;
  /** Язык упражнения в песочнице; у проектной задачи null. */
  language: string | null;
  level: CompanionLevel;
  involvement: CompanionInvolvement;
  status: CompanionTaskStatus;
  error: string | null;
  steps: CompanionStep[];
  currentStep: number;
  messages: CompanionMessage[];
  /** Модель агента задачи; null значит модель по умолчанию из настроек. */
  model: string | null;
  /** Токены за всю задачу и отдельно за планирование. */
  usage: CompanionUsage;
  planUsage: CompanionUsage;
  /** Этапы планирования, чтобы их можно было открыть и после. */
  planLog: CompanionActivity[];
  createdAt: number;
  updatedAt: number;
}

export interface CompanionTaskSummary {
  id: string;
  kind: CompanionTaskKind;
  title: string;
  status: CompanionTaskStatus;
  level: CompanionLevel;
  involvement: CompanionInvolvement;
  projectPath: string;
  stepCount: number;
  doneCount: number;
  updatedAt: number;
}

export interface CompanionNewTaskInput {
  kind: CompanionTaskKind;
  /** Проект для `project`; у песочницы игнорируется. */
  projectPath: string | null;
  goal: string;
  language?: string | null;
  level: CompanionLevel;
  involvement: CompanionInvolvement;
  model?: string | null;
}

export interface CompanionSlotCode {
  slotId: string;
  code: string;
}

export interface CompanionSolution {
  slots: CompanionSlotCode[];
}

export interface CompanionFile {
  path: string;
  text: string;
  /** sha256 содержимого; null у файла, которого ещё нет. */
  hash: string | null;
}

/** Настройки плагина в `AppSettings.companionPlugin`; отсутствие значит значения по умолчанию. */
export interface CompanionPluginSettings {
  level: CompanionLevel;
  involvement: CompanionInvolvement;
  /** Подсвечивать синтаксические ошибки на лету, без модели. */
  backgroundSyntaxCheck: boolean;
  /** Спрашивать перед показом решения. */
  confirmReveal: boolean;
}

export const DEFAULT_COMPANION_PLUGIN_SETTINGS: CompanionPluginSettings = {
  level: "middle",
  involvement: "part",
  backgroundSyntaxCheck: true,
  confirmReveal: true,
};

export interface CompanionTaskChangedEvent {
  taskId: string;
  /** null: задачу удалили. */
  task: CompanionTask | null;
}

export interface CompanionAgentProgressEvent {
  taskId: string;
  /** Что агент делает сейчас; null, когда запрос завершён. */
  text: string | null;
  /** Новый или изменившийся этап текущего запроса (по `id`). */
  activity?: CompanionActivity;
  /** Начался новый запрос: прежние этапы больше не показываются. */
  reset?: boolean;
  /** Токены текущего запроса на сейчас. */
  usage?: CompanionUsage;
}

export interface CompanionModelOption {
  modelId: string;
  name: string;
}

export interface CompanionModels {
  /** Модель по умолчанию, которой агент работает без выбора. */
  currentModelId: string;
  models: CompanionModelOption[];
}

export type CompanionStepOutcome = "done" | "skipped" | "agent";

/** Итог запуска файла упражнения. */
export interface CompanionRunResult {
  file: string;
  /** Как запускали, для показа над выводом. */
  command: string;
  /** stdout и stderr вперемешку, в порядке прихода. */
  output: string;
  /** null: процесс убит сигналом. */
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
}

/** Упражнение всегда в режиме обучения: агент пишет обвязку, человек логику. */
export const SANDBOX_INVOLVEMENT: CompanionInvolvement = "part";

/** Каналы `companion:*`, которые renderer зовёт через `window.koda.companionPlugin`. */
export interface CompanionPluginApi {
  listTasks(): Promise<CompanionTaskSummary[]>;
  getTask(taskId: string): Promise<CompanionTask | null>;
  /** Задача создаётся в статусе `planning`; план приходит событием `onTaskChanged`. */
  createTask(input: CompanionNewTaskInput): Promise<CompanionTask>;
  retryPlan(taskId: string): Promise<CompanionTask>;
  deleteTask(taskId: string): Promise<void>;
  readFile(taskId: string, path: string): Promise<CompanionFile>;
  /** `expectedHash` null: файла быть не должно. Расхождение отклоняется. */
  writeFile(taskId: string, path: string, text: string, expectedHash: string | null): Promise<CompanionFile>;
  /** Правки агента вставлены, слоты найдены: запоминает их положение. */
  saveAnchors(taskId: string, stepId: string, anchors: CompanionSlotAnchor[], applied: boolean): Promise<CompanionTask>;
  /** Правки шага не легли на текущие файлы: агент перечитывает файлы и присылает их заново. */
  repairStep(taskId: string, stepId: string): Promise<CompanionTask>;
  setCurrentStep(taskId: string, index: number): Promise<CompanionTask>;
  review(taskId: string, stepId: string, slots: CompanionSlotCode[]): Promise<CompanionReview>;
  hint(taskId: string, stepId: string, slotId: string | null, slots: CompanionSlotCode[]): Promise<CompanionHint>;
  solution(taskId: string, stepId: string): Promise<CompanionSolution>;
  completeStep(taskId: string, stepId: string, outcome: CompanionStepOutcome): Promise<CompanionTask>;
  ask(taskId: string, question: string, slots: CompanionSlotCode[]): Promise<CompanionMessage>;
  /** Прерывает текущий запрос к агенту этой задачи. */
  cancel(taskId: string): Promise<void>;
  revealFolder(taskId: string): Promise<void>;
  /** Модели для задачи в проекте или, при null, для упражнения. */
  listModels(projectPath: string | null): Promise<CompanionModels>;
  /** Меняет модель задачи; процесс агента перезапустится со следующим запросом. */
  setModel(taskId: string, model: string | null): Promise<CompanionTask>;
  /** Запускает файл упражнения и возвращает вывод; для задач в проекте отказ. */
  runFile(taskId: string, path: string): Promise<CompanionRunResult>;
  onTaskChanged(listener: (event: CompanionTaskChangedEvent) => void): () => void;
  onAgentProgress(listener: (event: CompanionAgentProgressEvent) => void): () => void;
}

/** Проект Koda, в котором можно начать задачу. */
export interface CompanionProject {
  path: string;
  name: string;
}
