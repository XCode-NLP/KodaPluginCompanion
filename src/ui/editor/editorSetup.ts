import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle,
  LanguageDescription,
  bracketMatching,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  type LanguageSupport,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type ViewUpdate,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

import { diagnosticsExtension, type DiagnosticsOptions } from "./diagnostics";
import { lockOutsideSlots, setSlots, slotExtensions, type EditorSlot } from "./slots";

/** Цвета берутся из тех же переменных, что и блоки кода в чате, поэтому тема переключается сама. */
const kodaHighlight = HighlightStyle.define([
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--code-syntax-comment)", fontStyle: "italic" },
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.modifier], color: "var(--code-syntax-keyword)" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--code-syntax-string)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--code-syntax-literal)" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.heading], color: "var(--code-syntax-title)" },
  { tag: [tags.typeName, tags.className, tags.attributeName, tags.propertyName], color: "var(--code-syntax-attr)" },
  { tag: [tags.variableName, tags.definition(tags.variableName)], color: "var(--code-syntax-variable)" },
  { tag: [tags.meta, tags.annotation, tags.processingInstruction], color: "var(--code-syntax-meta)" },
  { tag: tags.inserted, color: "var(--code-syntax-addition)" },
  { tag: tags.deleted, color: "var(--code-syntax-deletion)" },
  { tag: tags.invalid, color: "var(--danger)" },
]);

const kodaTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "var(--text-base)", backgroundColor: "transparent", color: "var(--text)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)", lineHeight: "1.6" },
  ".cm-content": { caretColor: "var(--text)", padding: "var(--space-4) 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text)" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted-2)", border: "none" },
  ".cm-activeLine": { backgroundColor: "var(--panel-hover)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text-soft)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--electric-violet) 28%, transparent)",
  },
  ".cm-tooltip": {
    // Panel is translucent; floating suggestions must hide the code beneath them.
    backgroundColor: "var(--canvas)",
    border: "1px solid var(--floating-border)",
    borderRadius: "var(--radius-sm)",
    boxShadow: "var(--floating-shadow)",
    color: "var(--text)",
  },
  ".cm-tooltip-lint": { maxWidth: "420px" },
  ".cm-diagnostic": { padding: "var(--space-3) var(--space-5)", whiteSpace: "pre-wrap" },
  ".cm-diagnostic-hint": { borderLeft: "3px solid var(--cyan-signal)" },
  ".cm-diagnostic-info": { borderLeft: "3px solid var(--info-blue)" },
  ".cm-diagnostic-warning": { borderLeft: "3px solid var(--spark-gold)" },
});

export const languageCompartment = new Compartment();
export const lockCompartment = new Compartment();

export interface EditorStateOptions extends DiagnosticsOptions {
  text: string;
  slots: EditorSlot[];
  locked: boolean;
  onUpdate: (update: ViewUpdate) => void;
  onSave: () => void;
}

export function createEditorState(options: EditorStateOptions): EditorState {
  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    foldGutter(),
    history(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    syntaxHighlighting(kodaHighlight),
    kodaTheme,
    keymap.of([
      { key: "Mod-s", preventDefault: true, run: () => (options.onSave(), true) },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
    ]),
    languageCompartment.of([]),
    lockCompartment.of(options.locked ? lockOutsideSlots : []),
    slotExtensions(),
    diagnosticsExtension(options),
    EditorView.updateListener.of(options.onUpdate),
  ];
  const state = EditorState.create({ doc: options.text, extensions });
  return state.update({ effects: setSlots.of(options.slots) }).state;
}

const loaded = new Map<string, Promise<LanguageSupport | null>>();

/** Грамматика по имени файла; языки грузятся лениво отдельными чанками. */
export function loadLanguage(path: string): Promise<LanguageSupport | null> {
  const name = path.split("/").pop() ?? path;
  const description = LanguageDescription.matchFilename(languages, name);
  if (!description) return Promise.resolve(null);
  let promise = loaded.get(description.name);
  if (!promise) {
    promise = description.load().catch(() => null);
    loaded.set(description.name, promise);
  }
  return promise;
}
