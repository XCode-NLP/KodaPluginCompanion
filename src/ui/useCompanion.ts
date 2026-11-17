import { useCallback, useEffect, useRef, useState } from "react";

import { t } from "../shared/i18n";
import { useNotifications } from "./notifications";
import { summarizeTask } from "../shared/companionTasks";
import type {
  CompanionActivity,
  CompanionModels,
  CompanionTask,
  CompanionTaskSummary,
  CompanionUsage,
} from "../shared/companionTypes";

import { companionApi, type CompanionPageApi } from "./companionApi";

export interface CompanionController {
  api: CompanionPageApi;
  tasks: CompanionTaskSummary[];
  selectedId: string | null;
  task: CompanionTask | null;
  /** Что сейчас делает агент выбранной задачи: undefined, пока он простаивает, "", пока думает без подробностей. */
  progress: string | undefined;
  /** Этапы текущего (или последнего) запроса выбранной задачи. */
  activities: CompanionActivity[];
  /** Токены текущего запроса; undefined, пока модель не ответила ни разу. */
  liveUsage: CompanionUsage | undefined;
  /** Модели для папки (null: упражнение); загружаются один раз на папку. */
  loadModels: (projectPath: string | null) => Promise<CompanionModels>;
  /** Имя идущего действия выбранной задачи. */
  busy: string | null;
  select: (taskId: string | null) => void;
  /** Действие с агентом или файлами: ошибка уходит в уведомление, результат или null. */
  run: <T>(name: string, action: () => Promise<T>, errorTitle?: string) => Promise<T | null>;
  setTask: (task: CompanionTask) => void;
}

/** Список задач, выбранная задача и прогресс агента; события main держат всё свежим. */
export function useCompanion(active: boolean): CompanionController {
  const api = companionApi();
  const { notifyError } = useNotifications();
  const [tasks, setTasks] = useState<CompanionTaskSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [task, setTaskState] = useState<CompanionTask | null>(null);
  const [progress, setProgress] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState<{ taskId: string; name: string } | null>(null);
  const [activities, setActivities] = useState<Record<string, CompanionActivity[]>>({});
  const [liveUsage, setLiveUsage] = useState<Record<string, CompanionUsage | undefined>>({});
  const modelsCache = useRef(new Map<string, Promise<CompanionModels>>());
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const upsertSummary = useCallback((next: CompanionTask) => {
    setTasks((list) =>
      [summarizeTask(next), ...list.filter((item) => item.id !== next.id)].sort((a, b) => b.updatedAt - a.updatedAt),
    );
  }, []);

  const setTask = useCallback(
    (next: CompanionTask) => {
      upsertSummary(next);
      if (selectedRef.current === next.id) setTaskState(next);
    },
    [upsertSummary],
  );

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    api
      .listTasks()
      .then((list) => {
        if (!cancelled) setTasks(list);
      })
      .catch((error) => notifyError(error, { title: t("companion.toast.loadFailed"), dedupeKey: "companion-list" }));
    return () => {
      cancelled = true;
    };
  }, [active, api, notifyError]);

  useEffect(() => {
    const offTask = api.onTaskChanged(({ taskId, task: next }) => {
      if (!next) {
        setTasks((list) => list.filter((item) => item.id !== taskId));
        if (selectedRef.current === taskId) {
          setSelectedId(null);
          setTaskState(null);
        }
        return;
      }
      setTask(next);
    });
    const offProgress = api.onAgentProgress(({ taskId, text, activity, reset, usage }) => {
      setProgress((current) => ({ ...current, [taskId]: text === null ? undefined : text || current[taskId] || "" }));
      // Запрос закончился, его токены уже в задаче.
      if (text === null) setLiveUsage((current) => ({ ...current, [taskId]: undefined }));
      if (reset) {
        setActivities((current) => ({ ...current, [taskId]: [] }));
        setLiveUsage((current) => ({ ...current, [taskId]: undefined }));
      }
      if (activity)
        setActivities((current) => {
          const list = current[taskId] ?? [];
          const index = list.findIndex((item) => item.id === activity.id);
          return { ...current, [taskId]: index < 0 ? [...list, activity] : list.map((item, at) => (at === index ? activity : item)) };
        });
      if (usage) setLiveUsage((current) => ({ ...current, [taskId]: usage }));
    });
    return () => {
      offTask();
      offProgress();
    };
  }, [api, setTask]);

  useEffect(() => {
    void api.selection().then(({ taskId }) => setSelectedId(taskId), () => undefined);
    return api.onSelected(({ taskId }) => setSelectedId(taskId));
  }, [api]);

  const select = useCallback(
    (taskId: string | null) => {
      setSelectedId(taskId);
      void api.select(taskId).catch(() => undefined);
    },
    [api],
  );

  useEffect(() => {
    if (!selectedId) {
      setTaskState(null);
      return;
    }
    let cancelled = false;
    api
      .getTask(selectedId)
      .then((loaded) => {
        if (!cancelled) setTaskState(loaded);
      })
      .catch((error) => notifyError(error, { title: t("companion.toast.loadFailed") }));
    return () => {
      cancelled = true;
    };
  }, [api, notifyError, selectedId]);

  const run = useCallback(
    async <T,>(name: string, action: () => Promise<T>, errorTitle?: string): Promise<T | null> => {
      const taskId = selectedRef.current ?? "";
      setBusy({ taskId, name });
      try {
        return await action();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Остановка пользователем: не ошибка, тост не нужен.
        if (!/cancelled/i.test(message)) notifyError(error, { title: errorTitle ?? t("companion.toast.failed") });
        return null;
      } finally {
        setBusy((current) => (current?.taskId === taskId && current.name === name ? null : current));
      }
    },
    [notifyError],
  );

  const loadModels = useCallback(
    (projectPath: string | null) => {
      const key = projectPath ?? "";
      let pending = modelsCache.current.get(key);
      if (!pending) {
        pending = api.listModels(projectPath);
        // Ошибка не кешируется: следующий вызов спросит снова.
        pending.catch(() => modelsCache.current.delete(key));
        modelsCache.current.set(key, pending);
      }
      return pending;
    },
    [api],
  );

  return {
    api,
    activities: selectedId ? (activities[selectedId] ?? []) : [],
    liveUsage: selectedId ? liveUsage[selectedId] : undefined,
    loadModels,
    tasks,
    selectedId,
    task: task && task.id === selectedId ? task : null,
    progress: selectedId ? progress[selectedId] : undefined,
    busy: busy && busy.taskId === selectedId ? busy.name : null,
    select,
    run,
    setTask,
  };
}
