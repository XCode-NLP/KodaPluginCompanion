import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";

import { connect } from "@kodadev/desktop-plugin-sdk/ui";
import { setUiLanguage } from "../shared/i18n";
import { createCompanionApi, setCompanionApi } from "./companionApi";
import { CompanionSidebarPage } from "./CompanionSidebarPage";
import { CompanionWorkspace } from "./CompanionWorkspace";
import { NotificationsProvider } from "./notifications";
import "./styles.css";

let theme: "light" | "dark" = "dark";
const themeListeners = new Set<() => void>();

function useTheme() {
  return useSyncExternalStore(
    (listener) => {
      themeListeners.add(listener);
      return () => themeListeners.delete(listener);
    },
    () => theme,
  );
}

/**
 * Классы и тема оболочки Koda: стили приложения ждут `.app[data-theme]`.
 * Одна сборка обслуживает обе страницы, какая из них открыта, говорит `viewId`.
 */
function Page({ sidebar }: { sidebar: boolean }) {
  const current = useTheme();
  return (
    <div className={sidebar ? "app companion-page companion-sidebar-page" : "app mode-companion companion-page"} data-theme={current}>
      <NotificationsProvider>{sidebar ? <CompanionSidebarPage /> : <CompanionWorkspace />}</NotificationsProvider>
    </div>
  );
}

async function start() {
  const host = await connect();
  setUiLanguage(host.language);
  document.documentElement.lang = host.language;
  theme = host.theme;
  host.on("language", (language) => {
    if (language === "ru" || language === "en") {
      setUiLanguage(language);
      document.documentElement.lang = language;
    }
  });
  host.on("theme", (next) => {
    if (next !== "light" && next !== "dark") return;
    theme = next;
    for (const listener of themeListeners) listener();
  });
  setCompanionApi(createCompanionApi(host));
  createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Page sidebar={host.viewId.endsWith(":sidebar")} />
    </React.StrictMode>,
  );
}

void start();
