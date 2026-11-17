import { markerIds, slotMarker } from "./companionEdits";
import type { CompanionPolicy } from "./companionPolicy";
import type {
  CompanionCommentSeverity,
  CompanionEdit,
  CompanionHint,
  CompanionHintRung,
  CompanionReview,
  CompanionReviewComment,
  CompanionSlot,
  CompanionStep,
  CompanionVerdict,
} from "./companionTypes";

/**
 * JSON-схемы ответов агента и их проверка. Схема уходит в
 * `complete_flow_step` (или в текст промпта у старого CLI), а нормализация
 * отбрасывает всё, что renderer не сможет показать или применить.
 */

type JsonSchema = Record<string, unknown>;

const str = (description: string): JsonSchema => ({ type: "string", description });

export const PLAN_SCHEMA: JsonSchema = {
  type: "object",
  required: ["title", "steps"],
  additionalProperties: false,
  properties: {
    title: str("Short task title, 3-8 words"),
    steps: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "explanation", "edits", "slots"],
        additionalProperties: false,
        properties: {
          title: str("Step title"),
          explanation: str("What this step does and why, in Markdown"),
          edits: {
            type: "array",
            items: {
              type: "object",
              required: ["file", "find", "replace"],
              additionalProperties: false,
              properties: {
                file: str("Path relative to the project root"),
                find: str("Exact existing text to replace; empty string appends to the file or creates it"),
                replace: str("New text; <<<SLOT:id>>> marks where the learner writes code"),
              },
            },
          },
          slots: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "file", "instruction", "placeholder", "solution"],
              additionalProperties: false,
              properties: {
                id: str("Slot id used in the <<<SLOT:id>>> marker, [a-z0-9-]"),
                file: str("File that contains the marker"),
                instruction: str("What the learner should write here"),
                placeholder: str("One short line shown inside the empty slot"),
                solution: str("Reference code for the slot, exactly as it should replace the marker"),
              },
            },
          },
        },
      },
    },
  },
};

export const REVIEW_SCHEMA: JsonSchema = {
  type: "object",
  required: ["verdict", "summary", "praise", "comments"],
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["ok", "almost", "wrong"] },
    summary: str("One or two friendly sentences"),
    praise: { type: ["string", "null"], description: "What the learner did well, or null" },
    comments: {
      type: "array",
      items: {
        type: "object",
        required: ["slotId", "line", "severity", "message", "suggestion"],
        additionalProperties: false,
        properties: {
          slotId: { type: ["string", "null"] },
          line: { type: ["integer", "null"], description: "Line inside the slot, starting at 1" },
          severity: { type: "string", enum: ["hint", "info", "warning"] },
          message: str("A gentle explanation of the problem"),
          suggestion: { type: ["string", "null"], description: "Replacement code for that line, or null" },
        },
      },
    },
  },
};

export const HINT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["text", "code"],
  additionalProperties: false,
  properties: {
    text: str("The hint, in Markdown"),
    code: { type: ["string", "null"], description: "Code fragment when the rung allows it, otherwise null" },
  },
};

export interface NormalizedPlan {
  title: string;
  steps: CompanionStep[];
  /** stepId → slotId → эталон. */
  solutions: Record<string, Record<string, string>>;
}

const MAX_TEXT = 8_000;
const MAX_CODE = 40_000;

function text(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Относительный путь внутри проекта или null. */
export function normalizeRelativePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!path || path.length > 400 || path.startsWith("/") || /^[a-zA-Z]:/.test(path) || path.startsWith("-")) return null;
  if (path.split("/").some((part) => part === ".." || part === "")) return null;
  return path;
}

function slotId(value: unknown): string | null {
  const id = text(value, 40).trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : null;
}

/**
 * Проверяет план. Слот без маркера выбрасывается, маркер без слота
 * удаляется, слоты сверх лимита политики заменяются эталоном: код шага
 * остаётся целым, просто его пишет агент.
 */
export function normalizePlan(value: unknown, policy: CompanionPolicy, newId: () => string): NormalizedPlan {
  const root = record(value);
  const steps: CompanionStep[] = [];
  const solutions: NormalizedPlan["solutions"] = {};
  for (const rawStep of list(root.steps).slice(0, policy.steps.max + 2)) {
    const stepRecord = record(rawStep);
    const edits: CompanionEdit[] = [];
    for (const rawEdit of list(stepRecord.edits)) {
      const edit = record(rawEdit);
      const file = normalizeRelativePath(edit.file);
      if (!file) continue;
      edits.push({ file, find: text(edit.find, MAX_CODE), replace: text(edit.replace, MAX_CODE) });
    }
    const markersByFile = new Map<string, Set<string>>();
    for (const edit of edits) {
      const ids = markersByFile.get(edit.file) ?? new Set<string>();
      for (const id of markerIds(edit.replace)) ids.add(id);
      markersByFile.set(edit.file, ids);
    }
    const slots: CompanionSlot[] = [];
    const stepSolutions: Record<string, string> = {};
    const extra = new Map<string, string>();
    for (const rawSlot of list(stepRecord.slots)) {
      const slot = record(rawSlot);
      const id = slotId(slot.id);
      if (!id || slots.some((item) => item.id === id) || extra.has(id)) continue;
      // Модель путает путь слота с путём правки: файл берётся по маркеру.
      const declared = normalizeRelativePath(slot.file);
      const file = declared && markersByFile.get(declared)?.has(id)
        ? declared
        : [...markersByFile].find(([, ids]) => ids.has(id))?.[0];
      if (!file) continue;
      const solution = text(slot.solution, MAX_CODE);
      if (slots.length >= policy.slotsPerStep) {
        extra.set(id, solution);
        continue;
      }
      slots.push({
        id,
        file,
        instruction: text(slot.instruction).trim(),
        placeholder: text(slot.placeholder, 200).split("\n")[0].trim(),
      });
      stepSolutions[id] = solution;
    }
    const known = new Set(slots.map((slot) => slot.id));
    const cleaned = edits.map((edit) => ({
      ...edit,
      replace: edit.replace.replace(/<<<SLOT:([A-Za-z0-9_-]{1,40})>>>/g, (marker, id: string) =>
        known.has(id) ? marker : (extra.get(id) ?? ""),
      ),
    }));
    // Маркер одного слота должен встретиться ровно один раз.
    for (const slot of slots) {
      let seen = false;
      for (const edit of cleaned) {
        if (edit.file !== slot.file) continue;
        edit.replace = edit.replace.split(slotMarker(slot.id)).reduce((acc, part, index) => {
          if (index === 0) return part;
          const keep = !seen;
          seen = true;
          return acc + (keep ? slotMarker(slot.id) : "") + part;
        }, "");
      }
    }
    const title = text(stepRecord.title, 200).trim();
    if (!title || (cleaned.length === 0 && slots.length === 0)) continue;
    const id = newId();
    steps.push({
      id,
      title,
      explanation: text(stepRecord.explanation).trim(),
      edits: cleaned,
      slots,
      status: "pending",
      applied: cleaned.length === 0,
      anchors: [],
      hints: [],
      review: null,
    });
    solutions[id] = stepSolutions;
  }
  if (steps.length === 0) throw new Error("The plan has no usable steps");
  steps[0].status = "active";
  return { title: text(root.title, 200).trim(), steps, solutions };
}

/** Сколько слотов пользователя в плане: план без них превращает задачу в просмотр кода агента. */
export function planSlotCount(steps: readonly Pick<CompanionStep, "slots">[]): number {
  return steps.reduce((sum, step) => sum + step.slots.length, 0);
}

/** Исправленные правки шага: у каждого слота должен остаться свой маркер. */
export function normalizeRepairedEdits(value: unknown, step: Pick<CompanionStep, "slots">): CompanionEdit[] {
  const edits: CompanionEdit[] = [];
  for (const rawEdit of list(record(value).edits)) {
    const edit = record(rawEdit);
    const file = normalizeRelativePath(edit.file);
    if (!file) continue;
    edits.push({ file, find: text(edit.find, MAX_CODE), replace: text(edit.replace, MAX_CODE) });
  }
  for (const slot of step.slots) {
    if (!edits.some((edit) => edit.file === slot.file && edit.replace.includes(slotMarker(slot.id))))
      throw new Error(`The repaired edits lost the slot ${slot.id}`);
  }
  if (edits.length === 0) throw new Error("The agent returned no edits");
  return edits;
}

const VERDICTS = new Set<CompanionVerdict>(["ok", "almost", "wrong"]);
const SEVERITIES = new Set<CompanionCommentSeverity>(["hint", "info", "warning"]);

export function normalizeReview(value: unknown, slotFiles: ReadonlyMap<string, string>, now: number): CompanionReview {
  const root = record(value);
  const verdict = VERDICTS.has(root.verdict as CompanionVerdict) ? (root.verdict as CompanionVerdict) : "almost";
  const comments: CompanionReviewComment[] = [];
  for (const raw of list(root.comments).slice(0, 12)) {
    const comment = record(raw);
    const message = text(comment.message).trim();
    if (!message) continue;
    const id = typeof comment.slotId === "string" && slotFiles.has(comment.slotId) ? comment.slotId : null;
    const line = Number.isInteger(comment.line) && (comment.line as number) > 0 ? (comment.line as number) : null;
    comments.push({
      slotId: id,
      file: id ? (slotFiles.get(id) ?? null) : null,
      line: id ? line : null,
      severity: SEVERITIES.has(comment.severity as CompanionCommentSeverity)
        ? (comment.severity as CompanionCommentSeverity)
        : "info",
      message,
      suggestion: typeof comment.suggestion === "string" && comment.suggestion.trim() ? comment.suggestion.slice(0, 2_000) : null,
    });
  }
  const praise = text(root.praise).trim();
  return {
    verdict,
    summary: text(root.summary).trim(),
    praise: praise || null,
    comments,
    createdAt: now,
  };
}

export function normalizeHint(value: unknown, slotId: string | null, rung: CompanionHintRung, now: number): CompanionHint {
  const root = record(value);
  const code = rung === "snippet" || rung === "pseudo" ? text(root.code, 4_000).trim() : "";
  const hintText = text(root.text).trim();
  if (!hintText && !code) throw new Error("The agent returned an empty hint");
  return { slotId, rung, text: hintText, code: code || null, createdAt: now };
}
