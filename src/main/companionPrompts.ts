import type { UiLanguage } from "../shared/i18n";
import type { CompanionPolicy } from "../shared/companionPolicy";
import type { CompanionEdit, CompanionHintRung, CompanionStep, CompanionTask } from "../shared/companionTypes";

/**
 * Промпты агента-компаньона. Пишутся по-английски (модель лучше держит
 * формат), отвечать агент должен на языке ответов пользователя. Всё, что
 * зависит от уровня и доли участия, берётся из `CompanionPolicy`.
 */

const LANGUAGE_NAME: Record<UiLanguage, string> = { ru: "Russian", en: "English" };

const LEVEL_TEXT: Record<CompanionPolicy["level"], string> = {
  novice:
    "The learner is a beginner. Use plain words, explain every new term once, be warm and encouraging, never condescending.",
  middle: "The learner is an intermediate developer. Be concise and point out idiomatic approaches.",
  senior: "The learner is an experienced engineer. Be terse; care about edge cases, performance and design.",
};

const SHARE_TEXT: Record<CompanionPolicy["agentShare"], (policy: CompanionPolicy) => string> = {
  nothing: (policy) =>
    `The learner writes ALL of the code. Your edits only place slot markers where code goes, with at most a signature or a one-line comment around them when that makes the place obvious. A slot may hold up to about ${policy.maxSlotLines} lines.`,
  scaffolding: (policy) =>
    `You write the scaffolding yourself inside the edits: imports, types, wiring, boilerplate, tests. The learner writes the core logic: function bodies, key conditions, algorithms. A slot holds about ${policy.maxSlotLines} lines.`,
  almostEverything: (policy) =>
    `You write nearly all of the code inside the edits. Leave only small gaps for the learner: a condition, an expression, a single call. Each slot is at most ${policy.maxSlotLines} lines.`,
};

const FOCUS_TEXT: Record<CompanionPolicy["reviewFocus"][number], string> = {
  errors: "real bugs and code that does not work",
  style: "readability",
  idioms: "idiomatic use of the language and libraries",
  edgeCases: "edge cases and error handling",
  performance: "performance",
  design: "design and naming",
};

const RUNG_TEXT: Record<CompanionHintRung, string> = {
  nudge: "a question or a one-sentence nudge pointing where to look. No code; set code to null.",
  concept: "name the concept, API or technique to use and explain it briefly. No solution code; set code to null.",
  pseudo: "the approach as short numbered steps; code may hold pseudo-code, never real code of the solution.",
  snippet: "a partial code fragment: a key line or a skeleton with gaps. Never the whole solution.",
};

function role(policy: CompanionPolicy, language: UiLanguage): string {
  return [
    "You are Koda Companion, a patient pair-programming mentor. The learner writes the code; you plan, hint and review.",
    "You have read-only tools. Never try to edit files or run commands.",
    'The Companion interface has a "Check" button ("Проверить" in Russian) that submits the learner code for review. Direct the learner to that button when they are ready. Do not tell them to run commands, launch a file or execute tests manually, and do not include launch instructions in explanations, slot instructions, hints or answers. You may explain how a main function or assertions work without asking the learner to run them.',
    LEVEL_TEXT[policy.level],
    `Write every human-readable text in ${LANGUAGE_NAME[language]}. Code, identifiers and file paths stay as they are.`,
  ].join("\n");
}

function fenced(code: string): string {
  const fence = code.includes("```") ? "~~~~" : "```";
  return `${fence}\n${code}\n${fence}`;
}

/** Сводка для нового процесса агента: что за задача и где пользователь сейчас. */
export function taskDigest(task: CompanionTask, policy: CompanionPolicy, language: UiLanguage): string {
  const lines = [role(policy, language), "", `Task: ${task.title || task.goal}`, `Goal: ${task.goal}`];
  if (task.steps.length) {
    lines.push("Plan:");
    task.steps.forEach((step, index) => lines.push(`${index + 1}. [${step.status}] ${step.title}`));
  }
  return lines.join("\n");
}

export function planPrompt(task: CompanionTask, policy: CompanionPolicy, language: UiLanguage): string {
  const where =
    task.kind === "sandbox"
      ? [
          `Create a self-contained practice exercise${task.language ? ` in ${task.language}` : ""} on this topic: ${task.goal}`,
          "The working folder is empty. The first step creates the starter files (edits with an empty find). The exercise must run without external dependencies and include a tiny way to check it (a main function or asserts).",
          "The learner runs a single file with a Run button (python3, node, go run, ruby or php, no arguments, no stdin), so keep one entry file that prints visible results when run directly. The `level` here is the difficulty of the exercise.",
        ]
      : [
          `Goal in this project: ${task.goal}`,
          "Study only the parts of the project the goal needs with your read-only tools, then plan the change.",
        ];
  return [
    role(policy, language),
    "",
    ...where,
    "",
    `Split the work into ${policy.steps.min}-${policy.steps.max} small steps in a sensible order. Each step has a title, an explanation in Markdown (${policy.explainConcepts ? "explain the concepts involved" : "1-3 sentences"}), edits and slots.`,
    "",
    "Edits are search/replace on files relative to the project root:",
    '- "find" is copied exactly from the current file: a few whole lines that are unique in the file. Empty "find" appends to the file or creates it.',
    '- "replace" is the new text for those lines.',
    "- Edits of a step apply after all earlier steps are finished. Never put the learner's slot code into a later \"find\": anchor on code you wrote or that already exists.",
    "",
    SHARE_TEXT[policy.agentShare](policy),
    "",
    "Slots:",
    "- The learner must write code in this task. Every step needs at least one slot; only the first step of an exercise that just creates starter files may have none. A plan where you write all the code is wrong.",
    "- Put <<<SLOT:id>>> in \"replace\" exactly where the learner's code goes, at the start of its own line (no indentation before the marker).",
    `- Describe each marker in "slots" with the same id and file. At most ${policy.slotsPerStep} slots per step. Ids are short kebab-case and unique in the whole plan.`,
    '- "solution" is the reference code for the slot including its own indentation, exactly as it replaces the marker.',
    '- "placeholder" is one short line of plain words shown inside the empty slot.',
    `- "instruction" says what to write without giving the answer away${policy.explainConcepts ? ", with a pointer to the concept to use" : ""}.`,
    "",
    "Touch only what the goal needs. After every step, once its slots are filled, the code must still build.",
  ].join("\n");
}

/** Повторный запрос, когда план вышел без слотов или почти без них. */
export function planRetryPrompt(policy: CompanionPolicy): string {
  return [
    "Your plan leaves almost no code for the learner: the steps have no usable slots, so you would write everything yourself. That defeats the purpose.",
    `Send the whole plan again. Every step must have 1-${policy.slotsPerStep} slots, each with a <<<SLOT:id>>> marker in "replace" of an edit to the same file, and a matching entry in "slots".`,
    SHARE_TEXT[policy.agentShare](policy),
  ].join("\n");
}

export interface SlotForPrompt {
  id: string;
  file: string;
  instruction: string;
  code: string;
  solution: string;
}

export interface FileForPrompt {
  path: string;
  text: string;
}

const MAX_FILE_CHARS = 20_000;

function files(list: FileForPrompt[]): string[] {
  return list.flatMap((file) => [
    `File ${file.path}:`,
    fenced(file.text.length > MAX_FILE_CHARS ? `${file.text.slice(0, MAX_FILE_CHARS)}\n… (truncated)` : file.text),
  ]);
}

function slotBlocks(slots: SlotForPrompt[], withSolution: boolean): string[] {
  return slots.flatMap((slot) => [
    `Slot ${slot.id} in ${slot.file}`,
    `Instruction: ${slot.instruction}`,
    "Learner's code:",
    slot.code.trim() ? fenced(slot.code) : "(empty)",
    ...(withSolution ? ["Reference solution (for you only; a different correct approach is fine):", fenced(slot.solution)] : []),
  ]);
}

export function reviewPrompt(
  step: CompanionStep,
  slots: SlotForPrompt[],
  fileList: FileForPrompt[],
  policy: CompanionPolicy,
): string {
  const focus = policy.reviewFocus.map((item) => FOCUS_TEXT[item]).join(", ");
  return [
    `Review the learner's code for the step "${step.title}".`,
    step.explanation,
    "",
    ...slotBlocks(slots, true),
    "",
    "Current files on disk:",
    ...files(fileList),
    "",
    "Rules:",
    '- verdict "ok" when the code does what the step needs (style differences are fine), "almost" when small fixes are needed, "wrong" when the approach does not work or a slot is empty.',
    "- Be gentle and specific: name the problem and nudge toward the fix. Never paste the whole solution.",
    `- Focus on ${focus}. At most ${policy.maxStyleComments} comments about style.`,
    '- "line" counts from 1 inside the slot\'s code. "suggestion" is replacement code for that single line, or null.',
    "- Praise one concrete good thing when there is one.",
  ].join("\n");
}

export function hintPrompt(
  step: CompanionStep,
  slot: SlotForPrompt | null,
  rung: CompanionHintRung,
  previous: string[],
  allSlots: SlotForPrompt[],
): string {
  return [
    `The learner asks for a hint on the step "${step.title}".`,
    step.explanation,
    "",
    ...slotBlocks(slot ? [slot] : allSlots, true),
    "",
    ...(previous.length ? ["Hints already given (go one level deeper, do not repeat them):", ...previous.map((hint) => `- ${hint}`), ""] : []),
    `Give ${RUNG_TEXT[rung]}`,
  ].join("\n");
}

export function askPrompt(task: CompanionTask, step: CompanionStep | null, question: string, slots: SlotForPrompt[]): string {
  return [
    `The learner asks a question while working on "${task.title || task.goal}"${step ? `, step "${step.title}"` : ""}.`,
    ...(slots.length ? ["", ...slotBlocks(slots, false)] : []),
    "",
    `Question: ${question}`,
    "",
    "Answer like a mentor, in Markdown. Explain and point the way; do not write the full code for the open slots unless the learner explicitly asks for it.",
  ].join("\n");
}

export const REPAIR_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["edits"],
  additionalProperties: false,
  properties: {
    edits: {
      type: "array",
      items: {
        type: "object",
        required: ["file", "find", "replace"],
        additionalProperties: false,
        properties: { file: { type: "string" }, find: { type: "string" }, replace: { type: "string" } },
      },
    },
  },
};

export function repairPrompt(step: CompanionStep, failed: CompanionEdit[]): string {
  return [
    `The edits of the step "${step.title}" could not be applied: their "find" text is not in the files any more (the learner's code differs from your reference).`,
    "Failed edits:",
    ...failed.map((edit) => `File ${edit.file}\nfind:\n${fenced(edit.find)}\nreplace:\n${fenced(edit.replace)}`),
    "",
    "Re-read the files and return ALL edits of this step again with \"find\" copied from the current files. Keep every <<<SLOT:id>>> marker with the same ids.",
  ].join("\n");
}
