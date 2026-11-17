import type { CompanionActivity, CompanionUsage } from "./companionTypes";

/** Вход одного запроса к модели, как его сообщает `context_usage_update`. */
export interface CompanionModelUsage {
  promptTokens: number;
  maxTokens: number | null;
  modelId: string | null;
}

/** Добавляет вход одного запроса к модели. */
export function addModelUsage(usage: CompanionUsage, added: CompanionModelUsage): CompanionUsage {
  return {
    inputTokens: usage.inputTokens + added.promptTokens,
    requests: usage.requests + 1,
    contextTokens: added.promptTokens,
    maxTokens: added.maxTokens ?? usage.maxTokens,
    modelId: added.modelId ?? usage.modelId,
  };
}

export function sumUsage(a: CompanionUsage, b: CompanionUsage): CompanionUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    requests: a.requests + b.requests,
    contextTokens: b.requests ? b.contextTokens : a.contextTokens,
    maxTokens: b.maxTokens ?? a.maxTokens,
    modelId: b.modelId ?? a.modelId,
  };
}

/** Обновление этапа приходит без заголовка и начала: берём их из прежней записи. */
export function mergeActivity(list: CompanionActivity[], next: CompanionActivity): CompanionActivity[] {
  const index = list.findIndex((item) => item.id === next.id);
  if (index < 0) return next.startedAt ? [...list, next] : list;
  const previous = list[index];
  const merged = { ...previous, ...next, text: next.text || previous.text, tool: next.tool ?? previous.tool, startedAt: previous.startedAt };
  return list.map((item, at) => (at === index ? merged : item));
}
