import { Annotation, EditorState, StateEffect, StateField, type Extension, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

/** Слот пользователя в буфере: диапазон двигается вместе с правками. */
export interface EditorSlot {
  id: string;
  placeholder: string;
  from: number;
  to: number;
  /** Подсвечен как текущий (выбран в панели шага). */
  focused?: boolean;
}

export const setSlots = StateEffect.define<EditorSlot[]>();
export const focusSlot = StateEffect.define<string | null>();

/** Правку внёс компаньон (код агента, решение): блокировка вне слотов её пропускает. */
export const companionWrite = Annotation.define<boolean>();

function mapSlots(slots: EditorSlot[], tr: Transaction): EditorSlot[] {
  // Вставка на границе слота попадает внутрь: начало тянется влево, конец вправо.
  return slots.map((slot) => {
    const from = tr.changes.mapPos(slot.from, -1);
    return { ...slot, from, to: Math.max(from, tr.changes.mapPos(slot.to, 1)) };
  });
}

export const slotField = StateField.define<EditorSlot[]>({
  create: () => [],
  update(slots, tr) {
    let next = tr.docChanged ? mapSlots(slots, tr) : slots;
    for (const effect of tr.effects) {
      if (effect.is(setSlots)) next = effect.value;
      if (effect.is(focusSlot)) next = next.map((slot) => ({ ...slot, focused: slot.id === effect.value }));
    }
    return next;
  },
});

class PlaceholderWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }

  eq(other: PlaceholderWidget): boolean {
    return other.text === this.text;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-companion-placeholder";
    span.textContent = this.text;
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function slotDecorations(state: EditorState): DecorationSet {
  const ranges = [];
  const lines = new Set<number>();
  for (const slot of state.field(slotField)) {
    const className = slot.focused ? "cm-companion-slot cm-companion-slot-focused" : "cm-companion-slot";
    const first = state.doc.lineAt(slot.from).number;
    const last = state.doc.lineAt(slot.to).number;
    for (let line = first; line <= last; line++) {
      const pos = state.doc.line(line).from;
      if (lines.has(pos)) continue;
      lines.add(pos);
      ranges.push(Decoration.line({ class: `${className}-line` }).range(pos));
    }
    if (slot.from !== slot.to) ranges.push(Decoration.mark({ class: className }).range(slot.from, slot.to));
    else if (slot.placeholder)
      ranges.push(Decoration.widget({ widget: new PlaceholderWidget(slot.placeholder), side: 1 }).range(slot.from));
  }
  return Decoration.set(ranges, true);
}

const slotDecorationField = StateField.define<DecorationSet>({
  create: (state) => slotDecorations(state),
  update(decorations, tr) {
    if (tr.docChanged || tr.effects.some((effect) => effect.is(setSlots) || effect.is(focusSlot)))
      return slotDecorations(tr.state);
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Правка целиком внутри какого-то слота (границы включительно). */
export function changeInsideSlots(tr: Transaction): boolean {
  const slots = tr.startState.field(slotField);
  let inside = true;
  tr.changes.iterChangedRanges((fromA, toA) => {
    if (!slots.some((slot) => fromA >= slot.from && toA <= slot.to)) inside = false;
  });
  return inside;
}

/** Блокировка вне слотов: для «минимальных правок», где агент пишет почти всё. */
export const lockOutsideSlots: Extension = EditorState.changeFilter.of(
  (tr) => !tr.docChanged || tr.annotation(companionWrite) === true || changeInsideSlots(tr),
);

export function slotExtensions(): Extension {
  return [slotField, slotDecorationField];
}

export function slotCode(state: EditorState, id: string): string | null {
  const slot = state.field(slotField).find((item) => item.id === id);
  return slot ? state.doc.sliceString(slot.from, slot.to) : null;
}

/** Заменяет содержимое слота (решение, подсказка) правкой компаньона. */
export function replaceSlot(view: EditorView, id: string, code: string): boolean {
  const slot = view.state.field(slotField).find((item) => item.id === id);
  if (!slot) return false;
  view.dispatch({
    changes: { from: slot.from, to: slot.to, insert: code },
    annotations: [companionWrite.of(true)],
    userEvent: "input.companion",
  });
  return true;
}

export function revealSlot(view: EditorView, id: string): boolean {
  const slot = view.state.field(slotField).find((item) => item.id === id);
  if (!slot) return false;
  view.dispatch({
    selection: { anchor: slot.to },
    effects: [focusSlot.of(id), EditorView.scrollIntoView(slot.from, { y: "center" })],
  });
  view.focus();
  return true;
}
