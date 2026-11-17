import { X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { useTranslation } from "./i18n";

interface Toast {
  id: number;
  title: string;
  message: string;
  dedupeKey?: string;
}

interface Notifications {
  notifyError: (error: unknown, options?: { title?: string; dedupeKey?: string }) => void;
}

const NotificationsContext = createContext<Notifications>({ notifyError: () => undefined });

export function useNotifications(): Notifications {
  return useContext(NotificationsContext);
}

const TOAST_MS = 8_000;

/** Тосты страницы плагина: ядро сюда не дотягивается, поэтому свой маленький центр. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);
  const notifyError = useCallback<Notifications["notifyError"]>(
    (error, options) => {
      const id = next.current++;
      const toast: Toast = {
        id,
        title: options?.title ?? t("companion.toast.failed"),
        message: error instanceof Error ? error.message : String(error),
        dedupeKey: options?.dedupeKey,
      };
      setToasts((list) => [...list.filter((item) => !toast.dedupeKey || item.dedupeKey !== toast.dedupeKey), toast].slice(-4));
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss, t],
  );
  const value = useMemo(() => ({ notifyError }), [notifyError]);
  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <div className="companion-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="companion-toast">
            <div>
              <strong>{toast.title}</strong>
              <span>{toast.message}</span>
            </div>
            <button type="button" className="icon-button" aria-label={t("companion.toast.close")} onClick={() => dismiss(toast.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </NotificationsContext.Provider>
  );
}
