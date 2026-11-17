import type { CompanionEdit, CompanionSlotAnchor } from "./companionTypes";

/** Маркер слота в `replace`: агент ставит его туда, где код пишет пользователь. */
export const SLOT_MARKER = /<<<SLOT:([A-Za-z0-9_-]{1,40})>>>/g;

export function slotMarker(id: string): string {
  return `<<<SLOT:${id}>>>`;
}

export function markerIds(text: string): string[] {
  return [...text.matchAll(SLOT_MARKER)].map((match) => match[1]);
}

export interface SlotRange {
  slotId: string;
  from: number;
  to: number;
}

export interface AppliedEdits {
  text: string;
  slots: SlotRange[];
  /** Правки, для которых `find` не нашёлся. */
  failed: CompanionEdit[];
}

/**
 * Ищет `find` в тексте: сначала точно, потом построчно без учёта отступов и
 * пробелов в конце строк (модель часто путает отступы). Возвращает
 * диапазон в исходном тексте.
 */
export function locateSnippet(text: string, find: string): { from: number; to: number } | null {
  const exact = text.indexOf(find);
  if (exact >= 0) return { from: exact, to: exact + find.length };
  const wanted = find
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, lines) => line !== "" || (index > 0 && index < lines.length - 1));
  if (wanted.length === 0) return null;
  const lines = text.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  for (let start = 0; start + wanted.length <= lines.length; start++) {
    let matched = true;
    for (let index = 0; index < wanted.length; index++) {
      if (lines[start + index].trim() !== wanted[index]) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const last = start + wanted.length - 1;
    return { from: starts[start], to: starts[last] + lines[last].length };
  }
  return null;
}

/**
 * Применяет правки одного файла и вынимает маркеры слотов. Маркеры остаются
 * в тексте до конца, чтобы позиции считались один раз по итоговому тексту.
 */
export function applyEdits(text: string, edits: readonly CompanionEdit[]): AppliedEdits {
  let next = text;
  const failed: CompanionEdit[] = [];
  for (const edit of edits) {
    if (edit.find === "") {
      next = next === "" ? edit.replace : `${next}${next.endsWith("\n") ? "" : "\n"}${edit.replace}`;
      continue;
    }
    const range = locateSnippet(next, edit.find);
    if (!range) {
      failed.push(edit);
      continue;
    }
    next = next.slice(0, range.from) + edit.replace + next.slice(range.to);
  }
  const slots: SlotRange[] = [];
  let result = "";
  let last = 0;
  for (const match of next.matchAll(SLOT_MARKER)) {
    const index = match.index ?? 0;
    result += next.slice(last, index);
    if (!slots.some((slot) => slot.slotId === match[1])) {
      slots.push({ slotId: match[1], from: result.length, to: result.length });
    }
    last = index + match[0].length;
  }
  result += next.slice(last);
  return { text: result, slots, failed };
}

const ANCHOR_CHARS = 200;

/** Запоминает текст вокруг слота. */
export function captureAnchor(text: string, file: string, range: SlotRange): CompanionSlotAnchor {
  return {
    slotId: range.slotId,
    file,
    before: text.slice(Math.max(0, range.from - ANCHOR_CHARS), range.from),
    after: text.slice(range.to, range.to + ANCHOR_CHARS),
  };
}

/**
 * Находит слот по запомненному окружению. Если файл поменялся рядом со
 * слотом, контекст укорачивается до нескольких символов с каждой стороны:
 * длинный контекст точнее, короткий переживает правки по соседству.
 */
export function locateAnchor(text: string, anchor: CompanionSlotAnchor): SlotRange | null {
  for (const size of [ANCHOR_CHARS, 80, 30, 12, 6, 3]) {
    const before = anchor.before.slice(-size);
    const after = anchor.after.slice(0, size);
    if (!before && !after) return { slotId: anchor.slotId, from: 0, to: text.length };
    let searchFrom = 0;
    for (;;) {
      const start = before ? text.indexOf(before, searchFrom) : 0;
      if (start < 0) break;
      const from = start + before.length;
      const to = after ? text.indexOf(after, from) : text.length;
      if (to >= 0) return { slotId: anchor.slotId, from, to };
      if (!before) break;
      searchFrom = start + 1;
    }
  }
  return null;
}
