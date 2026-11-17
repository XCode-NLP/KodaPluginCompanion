import { describe, expect, it } from "vitest";

import { applyEdits, captureAnchor, locateAnchor, locateSnippet } from "../src/shared/companionEdits";
import { companionPolicy } from "../src/shared/companionPolicy";
import {
  normalizeHint,
  normalizePlan,
  normalizeRelativePath,
  normalizeRepairedEdits,
  normalizeReview,
  planSlotCount,
} from "../src/shared/companionSchemas";

describe("companion edits", () => {
  it("applies search/replace edits and turns markers into empty slots", () => {
    const source = "def f(n):\n    return 0\n";
    const result = applyEdits(source, [{ file: "a.py", find: "    return 0", replace: "<<<SLOT:body>>>" }]);
    expect(result.failed).toEqual([]);
    expect(result.text).toBe("def f(n):\n\n");
    expect(result.slots).toEqual([{ slotId: "body", from: 10, to: 10 }]);
  });

  it("matches find text despite different indentation and appends with an empty find", () => {
    const source = "function a() {\n\treturn 1;\n}\n";
    expect(locateSnippet(source, "  return 1;")).toEqual({ from: 15, to: 25 });
    const result = applyEdits(source, [
      { file: "a.js", find: "    return 1;", replace: "  return <<<SLOT:value>>>;" },
      { file: "a.js", find: "", replace: "export { a };\n" },
    ]);
    expect(result.text).toBe("function a() {\n  return ;\n}\nexport { a };\n");
    expect(result.slots).toEqual([{ slotId: "value", from: 24, to: 24 }]);
  });

  it("reports edits whose find text is gone", () => {
    const result = applyEdits("x = 1\n", [{ file: "a.py", find: "y = 2", replace: "<<<SLOT:a>>>" }]);
    expect(result.failed).toHaveLength(1);
    expect(result.text).toBe("x = 1\n");
  });

  it("finds a slot again after edits elsewhere in the file", () => {
    const text = "head\nfunction f() {\n  user code\n}\ntail\n";
    const from = text.indexOf("  user code");
    const anchor = captureAnchor(text, "f.js", { slotId: "s", from, to: from + "  user code".length });
    const edited = `// new comment on top\n${text.replace("tail", "changed tail")}`;
    const located = locateAnchor(edited, anchor);
    expect(located && edited.slice(located.from, located.to)).toBe("  user code");
    expect(locateAnchor("totally different", anchor)).toBeNull();
  });
});

describe("companion schemas", () => {
  const policy = companionPolicy("middle", "part");
  let id = 0;
  const newId = () => `step-${++id}`;

  it("keeps valid steps, drops slots without markers and strips orphan markers", () => {
    const plan = normalizePlan(
      {
        title: "Email",
        steps: [
          {
            title: "Validate",
            explanation: "Why",
            edits: [{ file: "./src/a.ts", find: "x", replace: "<<<SLOT:a>>>\n<<<SLOT:orphan>>>" }],
            slots: [
              { id: "a", file: "src/a.ts", instruction: "Do", placeholder: "line one\nline two", solution: "code" },
              { id: "ghost", file: "src/a.ts", instruction: "", placeholder: "", solution: "" },
            ],
          },
          { title: "", edits: [], slots: [] },
          { title: "Escape", edits: [{ file: "../etc/passwd", find: "", replace: "x" }], slots: [] },
        ],
      },
      policy,
      newId,
    );
    expect(plan.steps).toHaveLength(1);
    const [step] = plan.steps;
    expect(step.status).toBe("active");
    expect(step.edits).toEqual([{ file: "src/a.ts", find: "x", replace: "<<<SLOT:a>>>\n" }]);
    expect(step.slots).toEqual([{ id: "a", file: "src/a.ts", instruction: "Do", placeholder: "line one" }]);
    expect(plan.solutions[step.id]).toEqual({ a: "code" });
  });

  it("fills slots over the policy limit with their solution", () => {
    const tight = companionPolicy("middle", "all");
    const plan = normalizePlan(
      {
        title: "T",
        steps: [
          {
            title: "S",
            explanation: "",
            edits: [{ file: "a.py", find: "", replace: "<<<SLOT:a>>>\n<<<SLOT:b>>>\n<<<SLOT:c>>>\n<<<SLOT:a>>>" }],
            slots: ["a", "b", "c"].map((slot) => ({ id: slot, file: "a.py", instruction: "", placeholder: "", solution: `${slot}()` })),
          },
        ],
      },
      tight,
      newId,
    );
    expect(plan.steps[0].slots.map((slot) => slot.id)).toEqual(["a", "b"]);
    expect(plan.steps[0].edits[0].replace).toBe("<<<SLOT:a>>>\n<<<SLOT:b>>>\nc()\n");
  });

  it("finds a slot's file by its marker when the declared path is off", () => {
    const plan = normalizePlan(
      {
        steps: [
          {
            title: "Body",
            edits: [{ file: "src/a.ts", find: "", replace: "<<<SLOT:body>>>\n" }],
            slots: [{ id: "body", file: "a.ts", instruction: "write", placeholder: "", solution: "x()" }],
          },
          { title: "Agent only", edits: [{ file: "src/a.ts", find: "", replace: "y()\n" }], slots: [] },
        ],
      },
      policy,
      newId,
    );
    expect(plan.steps[0].slots[0].file).toBe("src/a.ts");
    expect(planSlotCount(plan.steps)).toBe(1);
  });

  it("rejects a plan without usable steps", () => {
    expect(() => normalizePlan({ steps: [] }, policy, newId)).toThrow();
    expect(() => normalizePlan("nonsense", policy, newId)).toThrow();
  });

  it("normalizes reviews and hints defensively", () => {
    const review = normalizeReview(
      {
        verdict: "great",
        summary: "ok",
        praise: "",
        comments: [
          { slotId: "a", line: 2, severity: "warning", message: "Off by one", suggestion: "i < n" },
          { slotId: "zzz", line: 3, severity: "loud", message: "Elsewhere", suggestion: null },
          { message: "" },
        ],
      },
      new Map([["a", "src/a.ts"]]),
      5,
    );
    expect(review).toEqual({
      verdict: "almost",
      summary: "ok",
      praise: null,
      createdAt: 5,
      comments: [
        { slotId: "a", file: "src/a.ts", line: 2, severity: "warning", message: "Off by one", suggestion: "i < n" },
        { slotId: null, file: null, line: null, severity: "info", message: "Elsewhere", suggestion: null },
      ],
    });
    expect(normalizeHint({ text: "Look at %", code: "x % 3" }, "a", "nudge", 1).code).toBeNull();
    expect(normalizeHint({ text: "", code: "x % 3" }, "a", "snippet", 1).code).toBe("x % 3");
    expect(() => normalizeHint({ text: " ", code: null }, null, "concept", 1)).toThrow();
  });

  it("accepts repaired edits only when every slot keeps its marker", () => {
    const step = { slots: [{ id: "a", file: "a.py", instruction: "", placeholder: "" }] };
    expect(normalizeRepairedEdits({ edits: [{ file: "a.py", find: "y", replace: "<<<SLOT:a>>>" }] }, step)).toHaveLength(1);
    expect(() => normalizeRepairedEdits({ edits: [{ file: "a.py", find: "y", replace: "z" }] }, step)).toThrow();
  });

  it("accepts only relative paths inside the project", () => {
    expect(normalizeRelativePath("src\\a.ts")).toBe("src/a.ts");
    for (const bad of ["/etc/passwd", "C:/x", "../x", "a//b", "-rf", ""]) expect(normalizeRelativePath(bad)).toBeNull();
  });
});
