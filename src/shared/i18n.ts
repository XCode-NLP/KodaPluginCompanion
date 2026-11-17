import { companionMessages } from "./companionMessages";

/**
 * Свой маленький каталог строк: плагин живёт отдельно от ядра и не видит
 * его i18n. Язык приходит из `ctx.env.language` в main и из `connect()` на странице.
 */

export type UiLanguage = "ru" | "en";
export type TranslationParams = Record<string, string | number | boolean | null | undefined>;
export type TranslationCatalog = Record<string, readonly [string, string]>;

let currentLanguage: UiLanguage = "ru";
const listeners = new Set<() => void>();

export function getUiLanguage(): UiLanguage {
  return currentLanguage;
}

export function setUiLanguage(language: UiLanguage): void {
  if (currentLanguage === language) return;
  currentLanguage = language;
  for (const listener of listeners) listener();
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function localeTag(language: UiLanguage = currentLanguage): string {
  return language === "ru" ? "ru-RU" : "en-US";
}

function formatNumber(value: number, language: UiLanguage): string {
  // В QuickJS main-части Intl нет.
  return typeof Intl === "undefined" ? String(value) : new Intl.NumberFormat(localeTag(language)).format(value);
}

const messages: TranslationCatalog = companionMessages;

export function t(key: string, params: TranslationParams = {}, language: UiLanguage = currentLanguage): string {
  if (!Object.prototype.hasOwnProperty.call(messages, key)) return key;
  const template = messages[key][language === "ru" ? 0 : 1];
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)(:number)?\}/g, (match, name: string, format?: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return match;
    const value = params[name];
    return format && typeof value === "number" ? formatNumber(value, language) : String(value ?? "");
  });
}
