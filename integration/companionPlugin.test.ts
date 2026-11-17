import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import variant from "@jitl/quickjs-wasmfile-release-sync";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@desktop/src/main/logging/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
import { PluginAgentSession } from "@desktop/src/main/plugins/external/agentSession";
import { PluginHostApi } from "@desktop/src/main/plugins/external/hostApi";
import { PluginSandbox, type SandboxJson } from "@desktop/src/main/plugins/external/sandbox";
import type { PluginManifest } from "@desktop/src/shared/plugins";
import type { CompanionAgentProgressEvent, CompanionTask } from "../src/shared/companionTypes";
import { fakeHost, type PromptCall } from "@desktop/tests/main/fakeOneShotAgent";

const quickjs = newQuickJSWASMModuleFromVariant(variant);
let source = "";
let manifest: PluginManifest;
let root = "";
let project = "";
const sandboxes: PluginSandbox[] = [];

beforeAll(async () => {
  manifest = JSON.parse(await fs.readFile("koda-plugin.json", "utf8"));
  source = await fs.readFile(manifest.main!, "utf8");
});

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "koda-companion-")));
  project = path.join(root, "project");
  await fs.mkdir(project);
});

afterEach(async () => {
  sandboxes.splice(0).forEach((sandbox) => sandbox.dispose());
  await fs.rm(root, { recursive: true, force: true });
});

const PLAN = {
  title: "FizzBuzz",
  steps: [
    {
      title: "Rule",
      explanation: "Write the rule",
      edits: [{ file: "fizz.py", find: "", replace: "def fizz(n):\n<<<SLOT:rule>>>\n" }],
      slots: [{ id: "rule", file: "fizz.py", instruction: "Return Fizz", placeholder: "rule", solution: "    return 'Fizz'" }],
    },
    {
      title: "Tests",
      explanation: "Add asserts",
      edits: [{ file: "fizz.py", find: "def fizz(n):", replace: "def test():\n<<<SLOT:tests>>>\n\ndef fizz(n):" }],
      slots: [{ id: "tests", file: "fizz.py", instruction: "assert", placeholder: "assert", solution: "    assert fizz(3)" }],
    },
  ],
};

/** Плагин в настоящей песочнице QuickJS поверх настоящего хоста; вместо CLI отвечает тест. */
async function companion(answer: (call: PromptCall, index: number) => unknown, options: Parameters<typeof fakeHost>[1] = {}) {
  const fake = fakeHost(answer, options);
  const events: Array<[string, SandboxJson]> = [];
  let sandbox: PluginSandbox | null = null;
  const host = new PluginHostApi({
    manifest,
    dataDirectory: path.join(root, "data"),
    cipher: { available: () => false, encrypt: (s) => s, decrypt: (s) => s },
    projects: () => [{ path: project, name: "project" }],
    postToUi: (event, data) => events.push([event, data]),
    insertIntoComposer: vi.fn(),
    setChatContext: vi.fn(),
    notify: vi.fn(),
    getSettings: () => ({ level: "middle" }),
    createAgentSession: ({ projectPath, model }) => new PluginAgentSession({ host: fake.host, projectPath, model }),
    listModels: async () => ({ currentModelId: "m1", models: [{ modelId: "m1", name: "One" }] }),
    emitToPlugin: (event, data) => sandbox?.emit(event, data),
  });
  sandbox = PluginSandbox.create(
    await quickjs,
    source,
    { pluginId: manifest.id, version: manifest.version, appVersion: "0.0.0-dev", language: "en", theme: "dark" },
    { call: (method, params) => host.call(method, params), log: () => {} },
  );
  sandboxes.push(sandbox);
  await sandbox.activate();
  const call = <T>(method: string, ...args: unknown[]) =>
    sandbox!.invoke("ui", method, { args } as unknown as SandboxJson) as Promise<T>;
  const tasks = () => events.filter(([event]) => event === "task").map(([, data]) => (data as { task: CompanionTask | null }).task);
  const progress = () => events.filter(([event]) => event === "progress").map(([, data]) => data as unknown as CompanionAgentProgressEvent);
  const until = (status: CompanionTask["status"]) =>
    vi.waitFor(
      () => {
        const task = [...tasks()].reverse().find((item) => item?.status === status);
        expect(task, JSON.stringify(tasks().at(-1))).toBeDefined();
        return task as CompanionTask;
      },
      { timeout: 5_000, interval: 10 },
    );
  return { fake, host, call, events, tasks, progress, until };
}

describe("Companion plugin in the actual QuickJS sandbox", () => {
  it("plans a sandbox exercise, keeps solutions out of the page and walks the steps", async () => {
    const { fake, call, progress, until } = await companion(
      (prompt) => {
        if (prompt.text.includes("Split the work")) return PLAN;
        if (prompt.text.includes("Review the learner")) return { verdict: "ok", summary: "Nice", praise: null, comments: [] };
        if (prompt.text.includes("asks for a hint")) return { text: "Look at modulo", code: null };
        return "An answer";
      },
      { progress: "Reading fizz.py" },
    );
    const created = await call<CompanionTask>("createTask", {
      kind: "sandbox",
      projectPath: null,
      goal: "fizzbuzz",
      language: "Python",
      level: "middle",
      involvement: "part",
    });
    expect(created.status).toBe("planning");
    expect(created.projectPath).toBe(path.join(root, "data", "sandboxes", created.id));
    const task = await until("ready");
    expect(task.title).toBe("FizzBuzz");
    expect(task.steps.map((step: CompanionTask["steps"][number]) => step.status)).toEqual(["active", "pending"]);
    expect(JSON.stringify(task)).not.toContain("return 'Fizz'");
    expect(progress().map((event) => event.text)).toContain("Reading fizz.py");
    expect(fake.calls[0].text).toContain("practice exercise in Python");

    const [first, second] = task.steps;
    expect((await call<{ rung: string }>("hint", task.id, first.id, "rule", [{ slotId: "rule", code: "" }])).rung).toBe("nudge");
    expect((await call<{ rung: string }>("hint", task.id, first.id, "rule", [])).rung).toBe("concept");
    expect(await call("solution", task.id, first.id)).toEqual({ slots: [{ slotId: "rule", code: "    return 'Fizz'" }] });
    const review = await call<{ verdict: string }>("review", task.id, first.id, [{ slotId: "rule", code: "    return 'Fizz'" }]);
    expect(review.verdict).toBe("ok");
    expect(fake.calls.at(-1)!.text).toContain("Reference solution");

    const after = await call<CompanionTask>("completeStep", task.id, first.id, "done");
    expect(after.currentStep).toBe(1);
    expect((await call<CompanionTask>("completeStep", task.id, second.id, "agent")).status).toBe("done");
    expect(await call("askQuestion", task.id, "Why modulo?", [])).toMatchObject({ role: "agent", text: "An answer" });
    expect(fake.spawns).toBe(1);

    // Файлы упражнения пишутся в песочницу с проверкой хэша и запускаются там же.
    const file = await call<{ hash: string | null }>("readFile", task.id, "main.js");
    expect(file.hash).toBeNull();
    const saved = await call<{ hash: string }>("writeFile", task.id, "main.js", 'console.log("fizz")', null);
    await expect(call("writeFile", task.id, "main.js", "x", null)).rejects.toThrow(/changed on disk while it was open/);
    expect(saved.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await call("runFile", task.id, "main.js")).toMatchObject({ exitCode: 0, output: expect.stringContaining("fizz") });

    await call("deleteTask", task.id);
    await expect(fs.stat(created.projectPath)).rejects.toThrow();
    expect(await call("listTasks")).toEqual([]);
  });

  it("records planning stages and tokens, and switches the model of an open session", async () => {
    const { fake, call, progress, until } = await companion(() => PLAN, {
      updates: [
        { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Start with " } },
        { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "the rule." } },
        { sessionUpdate: "context_usage_update", source: "provider_usage", usedTokens: 1200, maxTokens: 100000, modelId: "m1" },
        { sessionUpdate: "tool_call", toolCallId: "t1", title: "Reading fizz.py", kind: "read", status: "pending" },
        { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" },
        { sessionUpdate: "context_usage_update", source: "provider_usage", usedTokens: 1800, maxTokens: 100000, modelId: "m1" },
      ],
    });
    const created = await call<CompanionTask>("createTask", {
      kind: "project",
      projectPath: project,
      goal: "add fizzbuzz",
      level: "middle",
      involvement: "part",
      model: "m1",
    });
    const ready = await until("ready");
    expect(fake.host.runOneShotAgent).toHaveBeenCalledWith(expect.objectContaining({ model: "m1", projectPath: project }));
    expect(ready.planLog.map((item: CompanionTask["planLog"][number]) => [item.kind, item.text, item.status])).toEqual([
      ["thought", "Start with the rule.", "done"],
      ["tool", "Reading fizz.py", "done"],
    ]);
    expect(ready.planUsage).toMatchObject({ inputTokens: 3000, requests: 2, contextTokens: 1800, maxTokens: 100000, modelId: "m1" });
    expect(progress()[0].reset).toBe(true);
    expect(progress().at(-1)?.text).toBeNull();

    expect((await call<CompanionTask>("setModel", created.id, " m2 ")).model).toBe("m2");
    await call("askQuestion", created.id, "why?", []);
    expect(fake.host.runOneShotAgent).toHaveBeenLastCalledWith(expect.objectContaining({ model: "m2" }));
    expect(fake.spawns).toBe(2);
    expect(await call("listModels", null)).toEqual({ currentModelId: "m1", models: [{ modelId: "m1", name: "One" }] });
    // Запуск кода только в упражнениях.
    await expect(call("runFile", created.id, "main.py")).rejects.toThrow(/exercises only/);
  });

  it("marks a failed plan, retries it and refuses unknown projects", async () => {
    let fail = true;
    const { call, until } = await companion(() => (fail ? new Error("model is down") : PLAN));
    await expect(
      call("createTask", { kind: "project", projectPath: "/elsewhere", goal: "x", level: "middle", involvement: "part" }),
    ).rejects.toThrow(/not found/);
    await expect(call("createTask", { kind: "project", projectPath: project, goal: "  ", level: "middle", involvement: "part" })).rejects.toThrow();
    const created = await call<CompanionTask>("createTask", {
      kind: "project",
      projectPath: project,
      goal: "add a check",
      level: "senior",
      involvement: "all",
    });
    const failed = await until("failed");
    expect(failed.error).toContain("model is down");
    fail = false;
    await call("retryPlan", created.id);
    const ready = await until("ready");
    await expect(call("readFile", ready.id, "../outside")).rejects.toThrow();
  });

  it("asks for the plan again when the agent left no slots for the user", async () => {
    const noSlots = {
      title: "All mine",
      steps: PLAN.steps.map((step) => ({ ...step, edits: [{ file: "fizz.py", find: "", replace: "pass\n" }], slots: [] })),
    };
    const prompts: string[] = [];
    const { call, until } = await companion((prompt) => {
      prompts.push(prompt.text);
      return prompt.text.includes("leaves almost no code") ? PLAN : noSlots;
    });
    await call("createTask", { kind: "project", projectPath: project, goal: "x", level: "middle", involvement: "part" });
    const ready = await until("ready");
    expect(ready.steps.every((step: CompanionTask["steps"][number]) => step.slots.length > 0)).toBe(true);
    expect(prompts.some((text) => text.includes("leaves almost no code"))).toBe(true);
  });

  it("keeps tasks in plugin storage and fails a plan interrupted by a restart", async () => {
    const first = await companion(() => new Promise(() => undefined));
    const created = await first.call<CompanionTask>("createTask", {
      kind: "project",
      projectPath: project,
      goal: "x",
      level: "middle",
      involvement: "part",
    });
    await first.host.flush();
    sandboxes.splice(0).forEach((sandbox) => sandbox.dispose());
    first.host.dispose();
    const second = await companion(() => PLAN);
    const [summary] = await second.call<Array<{ id: string; status: string }>>("listTasks");
    expect(summary).toMatchObject({ id: created.id, status: "failed" });
  });
});
