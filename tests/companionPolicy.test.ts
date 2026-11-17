import { describe, expect, it } from "vitest";

import { canRevealSolution, companionPolicy, nextHintRung } from "../src/shared/companionPolicy";
import { COMPANION_INVOLVEMENTS, COMPANION_LEVELS } from "../src/shared/companionTypes";

describe("companion policy", () => {
  it("covers every level and share with sane numbers", () => {
    for (const level of COMPANION_LEVELS) {
      for (const involvement of COMPANION_INVOLVEMENTS) {
        const policy = companionPolicy(level, involvement);
        expect(policy.steps.min).toBeGreaterThan(0);
        expect(policy.steps.max).toBeGreaterThanOrEqual(policy.steps.min);
        expect(policy.slotsPerStep).toBeGreaterThan(0);
        expect(policy.maxSlotLines).toBeGreaterThan(0);
        expect(policy.hintLadder.length).toBeGreaterThan(0);
      }
    }
  });

  it("locks the editor only when the agent writes nearly everything", () => {
    expect(companionPolicy("middle", "minimal")).toMatchObject({ agentShare: "almostEverything", lockOutsideSlots: true });
    expect(companionPolicy("middle", "part")).toMatchObject({ agentShare: "scaffolding", lockOutsideSlots: false });
    expect(companionPolicy("middle", "all")).toMatchObject({ agentShare: "nothing", lockOutsideSlots: false });
  });

  it("gives beginners small slots and more explanation than seniors", () => {
    const novice = companionPolicy("novice", "part");
    const senior = companionPolicy("senior", "part");
    expect(novice.maxSlotLines).toBeLessThan(senior.maxSlotLines);
    expect(novice.steps.max).toBeGreaterThan(senior.steps.max);
    expect(novice.explainConcepts).toBe(true);
    expect(senior.explainConcepts).toBe(false);
    expect(companionPolicy("novice", "minimal").maxSlotLines).toBeLessThan(companionPolicy("novice", "all").maxSlotLines);
  });

  it("walks the hint ladder and unlocks the solution after enough hints", () => {
    const middle = companionPolicy("middle", "part");
    expect([0, 1, 2, 3, 4].map((taken) => nextHintRung(middle, taken))).toEqual(["nudge", "concept", "pseudo", "snippet", null]);
    expect(canRevealSolution(middle, 1)).toBe(false);
    expect(canRevealSolution(middle, 2)).toBe(true);
    const novice = companionPolicy("novice", "all");
    expect(nextHintRung(novice, 0)).toBe("concept");
    expect(canRevealSolution(novice, 0)).toBe(false);
    expect(canRevealSolution(novice, 1)).toBe(true);
  });
});
