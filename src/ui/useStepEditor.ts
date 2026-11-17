import { forceLinting } from "@codemirror/lint";
import type { EditorState, StateEffect } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";

import { t } from "../shared/i18n";
import { applyEdits, captureAnchor, locateAnchor, type SlotRange } from "../shared/companionEdits";
import { stepFiles } from "../shared/companionTasks";
import type {
  CompanionEdit,
  CompanionPluginApi,
  CompanionReview,
  CompanionSlotAnchor,
  CompanionSlotCode,
  CompanionStep,
  CompanionTask,
} from "../shared/companionTypes";
import { setReviewMarks, type ReviewMark } from "./editor/diagnostics";
import { createEditorState, languageCompartment, loadLanguage } from "./editor/editorSetup";
import { companionWrite, focusSlot, replaceSlot, revealSlot, slotCode, slotField, type EditorSlot } from "./editor/slots";

const SAVE_DELAY = 700;

interface FileBuffer {
  state: EditorState;
  /** Хеш того, что лежит на диске; null, если файла нет. */
  hash: string | null;
  dirty: boolean;
}

export type SaveStatus = "idle" | "saving" | "saved";

export interface StepEditorOptions {
  api: CompanionPluginApi;
  task: CompanionTask | null;
  step: CompanionStep | null;
  locked: boolean;
  syntaxCheck: boolean;
  onTask: (task: CompanionTask) => void;
  onError: (error: unknown, title: string) => void;
}

export interface StepEditor {
  containerRef: (element: HTMLDivElement | null) => void;
  files: string[];
  activeFile: string | null;
  openFile: (path: string) => void;
  loading: boolean;
  loadError: string | null;
  /** Правки агента не легли на файлы: нужно попросить агента прислать их заново. */
  failedEdits: CompanionEdit[];
  /** Слоты, которых больше не найти в файле (его поменяли снаружи). */
  lostSlots: string[];
  /** Файл поменялся на диске, пока был открыт. */
  conflict: string | null;
  saveStatus: SaveStatus;
  /** Сколько файлов агент только что дописал своим кодом. */
  agentWroteFiles: number;
  slotCodes: () => CompanionSlotCode[];
  filledSlots: Set<string>;
  insertCode: (codes: CompanionSlotCode[]) => Promise<void>;
  focus: (slotId: string) => void;
  flush: () => Promise<void>;
  reloadFromDisk: () => void;
  overwriteDisk: () => Promise<void>;
}

function reviewMarks(state: EditorState, review: CompanionReview | null): ReviewMark[] {
  if (!review) return [];
  const slots = state.field(slotField);
  const marks: ReviewMark[] = [];
  for (const comment of review.comments) {
    const slot = slots.find((item) => item.id === comment.slotId);
    if (!slot) continue;
    let from = slot.from;
    let to = slot.to;
    if (comment.line) {
      const lines = state.doc.sliceString(slot.from, slot.to).split("\n");
      if (comment.line <= lines.length) {
        from = slot.from + lines.slice(0, comment.line - 1).reduce((sum, line) => sum + line.length + 1, 0);
        to = from + lines[comment.line - 1].length;
      }
    }
    marks.push({
      from,
      to: Math.max(to, Math.min(from + 1, state.doc.length)),
      severity: comment.severity,
      message: comment.suggestion ? `${comment.message}\n\n${comment.suggestion}` : comment.message,
    });
  }
  return marks;
}

/**
 * Буферы файлов текущего шага: один EditorView, состояние каждого файла
 * отдельно. Вставляет правки агента при первом открытии шага, находит
 * слоты по запомненному окружению, сохраняет правки пользователя с
 * проверкой хеша и держит положение слотов в main.
 */
export function useStepEditor({ api, task, step, locked, syntaxCheck, onTask, onError }: StepEditorOptions): StepEditor {
  const viewRef = useRef<EditorView | null>(null);
  const buffers = useRef(new Map<string, FileBuffer>());
  const activeRef = useRef<string | null>(null);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const anchorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const context = useRef({ api, task, step, onTask, onError, syntaxCheck });
  context.current = { api, task, step, onTask, onError, syntaxCheck };

  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failedEdits, setFailedEdits] = useState<CompanionEdit[]>([]);
  const [lostSlots, setLostSlots] = useState<string[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [agentWroteFiles, setAgentWroteFiles] = useState(0);
  const [filledSlots, setFilledSlots] = useState<Set<string>>(new Set());
  const [reloadToken, setReloadToken] = useState(0);

  const stateOf = useCallback((path: string): EditorState | null => {
    if (path === activeRef.current && viewRef.current) return viewRef.current.state;
    return buffers.current.get(path)?.state ?? null;
  }, []);

  /** Эффекты в буфер файла: открытому через view (без сброса прокрутки), остальным в сохранённое состояние. */
  const applyEffects = useCallback((path: string, effects: StateEffect<unknown> | StateEffect<unknown>[]) => {
    const buffer = buffers.current.get(path);
    if (!buffer) return;
    if (path === activeRef.current && viewRef.current) viewRef.current.dispatch({ effects });
    else buffer.state = buffer.state.update({ effects }).state;
  }, []);

  const refreshFilled = useCallback(() => {
    const filled = new Set<string>();
    for (const path of buffers.current.keys()) {
      const state = stateOf(path);
      for (const slot of state?.field(slotField) ?? []) {
        if (state && state.doc.sliceString(slot.from, slot.to).trim()) filled.add(slot.id);
      }
    }
    setFilledSlots((current) =>
      current.size === filled.size && [...filled].every((id) => current.has(id)) ? current : filled,
    );
  }, [stateOf]);

  const currentAnchors = useCallback((): CompanionSlotAnchor[] => {
    const anchors: CompanionSlotAnchor[] = [];
    for (const path of buffers.current.keys()) {
      const state = stateOf(path);
      if (!state) continue;
      const text = state.doc.toString();
      for (const slot of state.field(slotField)) anchors.push(captureAnchor(text, path, { slotId: slot.id, from: slot.from, to: slot.to }));
    }
    return anchors;
  }, [stateOf]);

  const pushAnchors = useCallback(
    (immediately = false) => {
      if (anchorTimer.current) clearTimeout(anchorTimer.current);
      const send = () => {
        const { api: currentApi, task: currentTask, step: currentStep, onTask: report } = context.current;
        if (!currentTask || !currentStep) return;
        void currentApi
          .saveAnchors(currentTask.id, currentStep.id, currentAnchors(), true)
          .then(report)
          .catch(() => undefined);
      };
      if (immediately) send();
      else anchorTimer.current = setTimeout(send, 1_500);
    },
    [currentAnchors],
  );

  const save = useCallback(
    async (path: string): Promise<void> => {
      const { api: currentApi, task: currentTask } = context.current;
      const buffer = buffers.current.get(path);
      const state = stateOf(path);
      if (!currentTask || !buffer || !state || !buffer.dirty) return;
      const timer = saveTimers.current.get(path);
      if (timer) clearTimeout(timer);
      saveTimers.current.delete(path);
      buffer.dirty = false;
      setSaveStatus("saving");
      try {
        const written = await currentApi.writeFile(currentTask.id, path, state.doc.toString(), buffer.hash);
        buffer.hash = written.hash;
        setSaveStatus("saved");
        pushAnchors();
      } catch (error) {
        buffer.dirty = true;
        setSaveStatus("idle");
        setConflict(path);
        context.current.onError(error, t("companion.toast.saveFailed"));
      }
    },
    [pushAnchors, stateOf],
  );

  const flush = useCallback(async () => {
    await Promise.all([...buffers.current.keys()].map((path) => save(path)));
  }, [save]);

  const onUpdate = useCallback(
    (path: string) => (update: ViewUpdate) => {
      if (!update.docChanged) return;
      const buffer = buffers.current.get(path);
      if (!buffer) return;
      buffer.dirty = true;
      setSaveStatus("idle");
      const timer = saveTimers.current.get(path);
      if (timer) clearTimeout(timer);
      saveTimers.current.set(
        path,
        setTimeout(() => void save(path), SAVE_DELAY),
      );
      refreshFilled();
    },
    [refreshFilled, save],
  );

  const showFile = useCallback(
    (path: string | null) => {
      const view = viewRef.current;
      const previous = activeRef.current;
      if (view && previous && buffers.current.has(previous)) buffers.current.get(previous)!.state = view.state;
      activeRef.current = path;
      setActiveFile(path);
      const buffer = path ? buffers.current.get(path) : null;
      if (view && buffer) view.setState(buffer.state);
    },
    [],
  );

  const containerRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) {
        const view = viewRef.current;
        const active = activeRef.current;
        if (view && active && buffers.current.has(active)) buffers.current.get(active)!.state = view.state;
        view?.destroy();
        viewRef.current = null;
        return;
      }
      if (viewRef.current) return;
      const active = activeRef.current;
      const buffer = active ? buffers.current.get(active) : null;
      viewRef.current = new EditorView({ parent: element, ...(buffer ? { state: buffer.state } : {}) });
    },
    [],
  );

  // Загрузка шага: правки агента при первом открытии, потом поиск слотов.
  const editsKey = step ? JSON.stringify(step.edits) : "";
  useEffect(() => {
    for (const timer of saveTimers.current.values()) clearTimeout(timer);
    saveTimers.current.clear();
    buffers.current.clear();
    setFailedEdits([]);
    setLostSlots([]);
    setConflict(null);
    setLoadError(null);
    setAgentWroteFiles(0);
    showFile(null);
    setFiles([]);
    if (!task || !step) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const paths = stepFiles(step);
        const read = await Promise.all(paths.map((path) => api.readFile(task.id, path)));
        if (cancelled) return;
        const ranges = new Map<string, SlotRange[]>();
        const texts = new Map<string, { text: string; hash: string | null }>();
        read.forEach((file) => texts.set(file.path, { text: file.text, hash: file.hash }));
        if (!step.applied) {
          const failed: CompanionEdit[] = [];
          const changed: string[] = [];
          for (const path of paths) {
            const current = texts.get(path)!;
            const applied = applyEdits(current.text, step.edits.filter((edit) => edit.file === path));
            failed.push(...applied.failed);
            ranges.set(path, applied.slots);
            if (applied.text !== current.text) {
              changed.push(path);
              texts.set(path, { text: applied.text, hash: current.hash });
            }
          }
          if (failed.length) {
            setFailedEdits(failed);
            return;
          }
          for (const path of changed) {
            const entry = texts.get(path)!;
            const written = await api.writeFile(task.id, path, entry.text, entry.hash);
            texts.set(path, { text: written.text, hash: written.hash });
          }
          if (cancelled) return;
          setAgentWroteFiles(changed.length);
          const anchors = paths.flatMap((path) =>
            (ranges.get(path) ?? []).map((range) => captureAnchor(texts.get(path)!.text, path, range)),
          );
          onTask(await api.saveAnchors(task.id, step.id, anchors, true));
        } else {
          const lost: string[] = [];
          for (const slot of step.slots) {
            const anchor = step.anchors.find((item) => item.slotId === slot.id);
            const text = texts.get(slot.file)?.text ?? "";
            const range = anchor ? locateAnchor(text, anchor) : null;
            if (!range) {
              lost.push(slot.id);
              continue;
            }
            ranges.set(slot.file, [...(ranges.get(slot.file) ?? []), range]);
          }
          setLostSlots(lost);
        }
        if (cancelled) return;
        for (const path of paths) {
          const entry = texts.get(path)!;
          const slots: EditorSlot[] = (ranges.get(path) ?? []).map((range) => ({
            id: range.slotId,
            from: range.from,
            to: range.to,
            placeholder: step.slots.find((slot) => slot.id === range.slotId)?.placeholder ?? "",
          }));
          const state = createEditorState({
            text: entry.text,
            slots,
            locked,
            onUpdate: onUpdate(path),
            onSave: () => void save(path),
            syntax: () => context.current.syntaxCheck,
            syntaxMessage: () => t("companion.editor.syntaxError"),
          });
          buffers.current.set(path, { state, hash: entry.hash, dirty: false });
          void loadLanguage(path).then((language) => {
            if (language && !cancelled) applyEffects(path, languageCompartment.reconfigure(language));
          });
        }
        setFiles(paths);
        const firstWithSlot = step.slots.find((slot) => ranges.get(slot.file)?.length)?.file;
        showFile(firstWithSlot ?? paths[0] ?? null);
        refreshFilled();
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Шаг перечитывается только при смене шага, правок или блокировки: свои же сохранения его не трогают.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, step?.id, editsKey, locked, reloadToken]);

  // Замечания проверки на строках слотов.
  const review = step?.review ?? null;
  useEffect(() => {
    for (const path of buffers.current.keys()) {
      const state = stateOf(path);
      if (state) applyEffects(path, setReviewMarks.of(reviewMarks(state, review)));
    }
    if (viewRef.current) forceLinting(viewRef.current);
  }, [applyEffects, files, review, stateOf]);

  useEffect(() => {
    if (viewRef.current) forceLinting(viewRef.current);
  }, [syntaxCheck]);

  // Сохранить незаписанное при уходе с шага или закрытии режима.
  useEffect(
    () => () => {
      void flush();
      if (anchorTimer.current) clearTimeout(anchorTimer.current);
    },
    [flush],
  );

  const slotCodes = useCallback((): CompanionSlotCode[] => {
    const current = context.current.step;
    if (!current) return [];
    return current.slots.map((slot) => {
      const state = stateOf(slot.file);
      return { slotId: slot.id, code: (state && slotCode(state, slot.id)) ?? "" };
    });
  }, [stateOf]);

  const insertCode = useCallback(
    async (codes: CompanionSlotCode[]) => {
      const current = context.current.step;
      if (!current) return;
      for (const item of codes) {
        const slot = current.slots.find((entry) => entry.id === item.slotId);
        if (!slot) continue;
        const buffer = buffers.current.get(slot.file);
        if (!buffer) continue;
        if (slot.file === activeRef.current && viewRef.current) {
          replaceSlot(viewRef.current, slot.id, item.code);
          continue;
        }
        const state = buffer.state;
        const range = state.field(slotField).find((entry) => entry.id === slot.id);
        if (!range) continue;
        buffer.state = state.update({
          changes: { from: range.from, to: range.to, insert: item.code },
          annotations: [companionWrite.of(true)],
        }).state;
        buffer.dirty = true;
      }
      refreshFilled();
      await flush();
      pushAnchors(true);
    },
    [flush, pushAnchors, refreshFilled],
  );

  const focus = useCallback(
    (slotId: string) => {
      const slot = context.current.step?.slots.find((entry) => entry.id === slotId);
      if (!slot || !buffers.current.has(slot.file)) return;
      if (activeRef.current !== slot.file) showFile(slot.file);
      const view = viewRef.current;
      if (view) {
        if (!revealSlot(view, slotId)) view.dispatch({ effects: focusSlot.of(null) });
      }
    },
    [showFile],
  );

  const reloadFromDisk = useCallback(() => {
    setConflict(null);
    setReloadToken((value) => value + 1);
  }, []);

  const overwriteDisk = useCallback(async () => {
    const { api: currentApi, task: currentTask } = context.current;
    const path = conflict;
    const buffer = path ? buffers.current.get(path) : null;
    if (!currentTask || !path || !buffer) return;
    const disk = await currentApi.readFile(currentTask.id, path);
    buffer.hash = disk.hash;
    buffer.dirty = true;
    setConflict(null);
    await save(path);
  }, [conflict, save]);

  return {
    containerRef,
    files,
    activeFile,
    openFile: showFile,
    loading,
    loadError,
    failedEdits,
    lostSlots,
    conflict,
    saveStatus,
    agentWroteFiles,
    slotCodes,
    filledSlots,
    insertCode,
    focus,
    flush,
    reloadFromDisk,
    overwriteDisk,
  };
}
