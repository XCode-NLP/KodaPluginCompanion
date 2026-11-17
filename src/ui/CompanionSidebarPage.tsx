import { CompanionSidebar } from "./components/CompanionSidebar";
import { useCompanion } from "./useCompanion";

/** Страница в левой колонке Koda, под переключателем режимов: список задач и кнопки новой задачи. */
export function CompanionSidebarPage() {
  const { api, tasks, selectedId, select } = useCompanion(true);
  return (
    <CompanionSidebar
      tasks={tasks}
      selectedId={selectedId}
      onSelect={select}
      onNew={(kind) => void api.openNew(kind).catch(() => undefined)}
    />
  );
}
