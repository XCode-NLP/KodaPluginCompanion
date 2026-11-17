import type { CompanionHintRung, CompanionInvolvement, CompanionLevel } from "./companionTypes";

/** Что агент пишет сам. */
export type CompanionAgentShare = "nothing" | "scaffolding" | "almostEverything";

/**
 * Правила задачи для пары «уровень × доля участия». Из них собираются
 * промпты агента, проверка его ответов и поведение редактора, поэтому
 * числа живут в одном месте.
 */
export interface CompanionPolicy {
  level: CompanionLevel;
  involvement: CompanionInvolvement;
  /** Сколько шагов просить у агента. */
  steps: { min: number; max: number };
  /** Сколько слотов пользователя в одном шаге. */
  slotsPerStep: number;
  /** Ожидаемый размер слота в строках: агент получает его как ориентир. */
  maxSlotLines: number;
  agentShare: CompanionAgentShare;
  /** Редактировать можно только внутри слотов. */
  lockOutsideSlots: boolean;
  /** Ступени подсказок по порядку; после последней остаётся только решение. */
  hintLadder: readonly CompanionHintRung[];
  /** Сколько подсказок надо взять, прежде чем открыть решение. */
  revealAfterHints: number;
  /** На что смотрит проверка. */
  reviewFocus: readonly ("errors" | "style" | "idioms" | "edgeCases" | "performance" | "design")[];
  /** Сколько замечаний по стилю допускается в одной проверке. */
  maxStyleComments: number;
  explainConcepts: boolean;
}

const LEVELS: Record<
  CompanionLevel,
  Pick<
    CompanionPolicy,
    "steps" | "hintLadder" | "revealAfterHints" | "reviewFocus" | "maxStyleComments" | "explainConcepts"
  >
> = {
  novice: {
    steps: { min: 4, max: 8 },
    hintLadder: ["concept", "pseudo", "snippet"],
    revealAfterHints: 1,
    reviewFocus: ["errors", "style"],
    maxStyleComments: 1,
    explainConcepts: true,
  },
  middle: {
    steps: { min: 3, max: 6 },
    hintLadder: ["nudge", "concept", "pseudo", "snippet"],
    revealAfterHints: 2,
    reviewFocus: ["errors", "idioms", "style"],
    maxStyleComments: 2,
    explainConcepts: false,
  },
  senior: {
    steps: { min: 2, max: 4 },
    hintLadder: ["nudge", "snippet"],
    revealAfterHints: 1,
    reviewFocus: ["errors", "edgeCases", "performance", "design"],
    maxStyleComments: 0,
    explainConcepts: false,
  },
};

const SLOT_LINES: Record<CompanionInvolvement, Record<CompanionLevel, number>> = {
  all: { novice: 25, middle: 50, senior: 120 },
  part: { novice: 10, middle: 20, senior: 40 },
  minimal: { novice: 2, middle: 3, senior: 5 },
};

const INVOLVEMENT: Record<CompanionInvolvement, Pick<CompanionPolicy, "slotsPerStep" | "agentShare" | "lockOutsideSlots">> =
  {
    all: { slotsPerStep: 2, agentShare: "nothing", lockOutsideSlots: false },
    part: { slotsPerStep: 3, agentShare: "scaffolding", lockOutsideSlots: false },
    minimal: { slotsPerStep: 3, agentShare: "almostEverything", lockOutsideSlots: true },
  };

export function companionPolicy(level: CompanionLevel, involvement: CompanionInvolvement): CompanionPolicy {
  return {
    level,
    involvement,
    ...LEVELS[level],
    ...INVOLVEMENT[involvement],
    maxSlotLines: SLOT_LINES[involvement][level],
  };
}

/** Следующая ступень подсказки для слота; null, когда лестница пройдена. */
export function nextHintRung(policy: CompanionPolicy, hintsTaken: number): CompanionHintRung | null {
  return policy.hintLadder[hintsTaken] ?? null;
}

/** Решение открывается после нужного числа подсказок или когда лестница пройдена. */
export function canRevealSolution(policy: CompanionPolicy, hintsTaken: number): boolean {
  return hintsTaken >= Math.min(policy.revealAfterHints, policy.hintLadder.length);
}
