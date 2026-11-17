import { summarizeTask } from "../shared/companionTasks";
import { EMPTY_COMPANION_USAGE, type CompanionTask, type CompanionTaskSummary } from "../shared/companionTypes";

/** Задача в хранилище плагина: эталоны слотов лежат рядом и на страницу не уходят. */
export interface StoredCompanionTask {
  task: CompanionTask;
  /** stepId → slotId → эталон. */
  solutions: Record<string, Record<string, string>>;
}

/** Часть `ctx.storage`, которой пользуется хранилище; тесты подставляют объект в памяти. */
export interface CompanionStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

function isStoredTask(value: unknown): value is StoredCompanionTask {
  if (!value || typeof value !== "object") return false;
  const { task, solutions } = value as Partial<StoredCompanionTask>;
  return (
    !!task &&
    typeof task.id === "string" &&
    typeof task.projectPath === "string" &&
    Array.isArray(task.steps) &&
    Array.isArray(task.messages) &&
    !!solutions &&
    typeof solutions === "object"
  );
}

const TASK_ID = /^[a-z0-9-]{8,64}$/;
const INDEX_KEY = "tasks";

function taskKey(id: string): string {
  if (!TASK_ID.test(id)) throw new Error("Invalid companion task id");
  return `task:${id}`;
}

/**
 * Задачи в `ctx.storage`: по ключу на задачу и список id. Записи идут по
 * очереди, так что список и задачи на диске не расходятся.
 */
export class CompanionStore {
  private readonly tasks = new Map<string, StoredCompanionTask>();
  private writes: Promise<void> = Promise.resolve();
  private loaded: Promise<void> | null = null;

  constructor(private readonly storage: CompanionStorage) {}

  load(): Promise<void> {
    this.loaded ??= (async () => {
      const ids = await this.storage.get(INDEX_KEY);
      for (const id of Array.isArray(ids) ? ids : []) {
        if (typeof id !== "string" || !TASK_ID.test(id)) continue;
        const stored = await this.storage.get(taskKey(id));
        if (!isStoredTask(stored)) continue;
        // Прерванное планирование не продолжится само: процесс агента умер вместе с приложением.
        if (stored.task.status === "planning") stored.task = { ...stored.task, status: "failed", error: null };
        stored.task = {
          ...stored.task,
          model: typeof stored.task.model === "string" ? stored.task.model : null,
          usage: { ...EMPTY_COMPANION_USAGE, ...stored.task.usage },
          planUsage: { ...EMPTY_COMPANION_USAGE, ...stored.task.planUsage },
          planLog: Array.isArray(stored.task.planLog) ? stored.task.planLog : [],
        };
        this.tasks.set(stored.task.id, stored);
      }
    })();
    return this.loaded;
  }

  list(): CompanionTaskSummary[] {
    return [...this.tasks.values()].map((stored) => summarizeTask(stored.task)).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): StoredCompanionTask | null {
    return this.tasks.get(id) ?? null;
  }

  save(stored: StoredCompanionTask): Promise<void> {
    const isNew = !this.tasks.has(stored.task.id);
    this.tasks.set(stored.task.id, stored);
    const snapshot = JSON.parse(JSON.stringify(stored)) as StoredCompanionTask;
    return this.enqueue(async () => {
      await this.storage.set(taskKey(snapshot.task.id), snapshot);
      if (isNew) await this.storage.set(INDEX_KEY, [...this.tasks.keys()]);
    });
  }

  delete(id: string): Promise<void> {
    this.tasks.delete(id);
    return this.enqueue(async () => {
      await this.storage.set(INDEX_KEY, [...this.tasks.keys()]);
      await this.storage.delete(taskKey(id));
    });
  }

  /** Дожидается всех начатых записей. */
  flush(): Promise<void> {
    return this.writes.catch(() => undefined);
  }

  private enqueue(write: () => Promise<void>): Promise<void> {
    const next = this.writes.catch(() => undefined).then(write);
    this.writes = next;
    return next;
  }
}
