import { ensureSyntaxTree } from "@codemirror/language";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";

import { slotField } from "./slots";

/** Замечание проверки, привязанное к позиции в буфере; двигается вместе с правками. */
export interface ReviewMark {
  from: number;
  to: number;
  severity: "hint" | "info" | "warning";
  message: string;
}

export const setReviewMarks = StateEffect.define<ReviewMark[]>();

export const reviewMarkField = StateField.define<ReviewMark[]>({
  create: () => [],
  update(marks, tr) {
    let next = marks;
    if (tr.docChanged)
      next = next.map((mark) => {
        const from = tr.changes.mapPos(mark.from, 1);
        return { ...mark, from, to: Math.max(from, tr.changes.mapPos(mark.to, -1)) };
      });
    for (const effect of tr.effects) if (effect.is(setReviewMarks)) next = effect.value;
    return next;
  },
});

const MAX_SYNTAX_ERRORS = 20;

/**
 * Синтаксические ошибки из дерева Lezer: работает без модели и без
 * компилятора, для любого языка с грамматикой. Строки с пустым слотом
 * пропускаются: код вокруг ещё не дописан, и ругаться на него рано.
 */
export function syntaxDiagnostics(state: EditorState, message: string): Diagnostic[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 200);
  if (!tree) return [];
  const emptySlotLines = new Set(
    state
      .field(slotField, false)
      ?.filter((slot) => slot.from === slot.to)
      .map((slot) => state.doc.lineAt(slot.from).number) ?? [],
  );
  const result: Diagnostic[] = [];
  tree.iterate({
    enter: (node) => {
      if (result.length >= MAX_SYNTAX_ERRORS) return false;
      if (!node.type.isError) return undefined;
      const line = state.doc.lineAt(node.from).number;
      if (emptySlotLines.has(line) || emptySlotLines.has(line - 1) || emptySlotLines.has(line + 1)) return false;
      const to = node.to > node.from ? node.to : Math.min(state.doc.length, node.from + 1);
      if (!result.some((item) => item.from === node.from)) result.push({ from: node.from, to, severity: "warning", message });
      return false;
    },
  });
  return result;
}

export interface DiagnosticsOptions {
  syntax: () => boolean;
  syntaxMessage: () => string;
}

/** Синтаксис в фоне плюс замечания последней проверки в одном источнике lint. */
export function diagnosticsExtension(options: DiagnosticsOptions): Extension {
  return [
    reviewMarkField,
    lintGutter(),
    linter(
      (view) => {
        const review = view.state.field(reviewMarkField).map<Diagnostic>((mark) => ({
          from: mark.from,
          to: mark.to,
          severity: mark.severity,
          message: mark.message,
          source: "Koda",
        }));
        return options.syntax() ? [...syntaxDiagnostics(view.state, options.syntaxMessage()), ...review] : review;
      },
      {
        delay: 500,
        needsRefresh: (update) => update.transactions.some((tr) => tr.effects.some((effect) => effect.is(setReviewMarks))),
      },
    ),
  ];
}
