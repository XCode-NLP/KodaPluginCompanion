import { useCallback, useSyncExternalStore } from "react";

import { getUiLanguage, subscribeLanguage, t as translate, type TranslationParams } from "../shared/i18n";

export function useTranslation() {
  const language = useSyncExternalStore(subscribeLanguage, getUiLanguage, getUiLanguage);
  const t = useCallback((key: string, params?: TranslationParams) => translate(key, params, language), [language]);
  return { t, language };
}
