import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { syntaxDiagnostics } from "../src/ui/editor/diagnostics";
import {
  companionWrite,
  lockOutsideSlots,
  setSlots,
  slotCode,
  slotExtensions,
  slotField,
} from "../src/ui/editor/slots";

function stateWith(doc: string, slots: { id: string; from: number; to: number }[], locked = false) {
  const state = EditorState.create({ doc, extensions: [slotExtensions(), locked ? lockOutsideSlots : [], javascript()] });
  return state.update({ effects: setSlots.of(slots.map((slot) => ({ ...slot, placeholder: "write here" }))) }).state;
}

describe("companion editor slots", () => {
  it("grows an empty slot with typed text and moves it with edits above", () => {
    const doc = "function f() {\n\n}\n";
    let state = stateWith(doc, [{ id: "body", from: 15, to: 15 }]);
    state = state.update({ changes: { from: 15, insert: "  return 1;" } }).state;
    expect(slotCode(state, "body")).toBe("  return 1;");
    state = state.update({ changes: { from: 0, insert: "// header\n" } }).state;
    expect(slotCode(state, "body")).toBe("  return 1;");
    state = state.update({ changes: { from: state.field(slotField)[0].to, insert: "\n  // more" } }).state;
    expect(slotCode(state, "body")).toBe("  return 1;\n  // more");
  });

  it("blocks edits outside slots when locked, but lets the companion write anywhere", () => {
    const doc = "if (x) {\n  y();\n}\n";
    const locked = stateWith(doc, [{ id: "cond", from: 4, to: 5 }], true);
    expect(locked.update({ changes: { from: 0, insert: "// nope\n" } }).state.doc.toString()).toBe(doc);
    expect(locked.update({ changes: { from: 4, to: 5, insert: "ready" } }).state.doc.toString()).toBe("if (ready) {\n  y();\n}\n");
    expect(
      locked.update({ changes: { from: 0, insert: "// agent\n" }, annotations: companionWrite.of(true) }).state.doc.toString(),
    ).toBe(`// agent\n${doc}`);
    const open = stateWith(doc, [{ id: "cond", from: 4, to: 5 }]);
    expect(open.update({ changes: { from: 0, insert: "// ok\n" } }).state.doc.toString()).toBe(`// ok\n${doc}`);
  });

  it("reports syntax errors but stays quiet next to an empty slot", () => {
    const broken = stateWith("const a = ;\nconst b = 2;\n", []);
    expect(syntaxDiagnostics(broken, "syntax").length).toBeGreaterThan(0);
    expect(syntaxDiagnostics(stateWith("const a = 1;\n", []), "syntax")).toEqual([]);
    const pending = stateWith("if () {\n}\n", [{ id: "cond", from: 4, to: 4 }]);
    expect(syntaxDiagnostics(pending, "syntax")).toEqual([]);
  });
});
