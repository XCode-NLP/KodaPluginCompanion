import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { useTranslation } from "../i18n";
import type { CompanionTask } from "../../shared/companionTypes";
import { ActivityFeed, UsageLabel } from "./AgentActivity";

/** Сохранённые этапы планирования: свёрнуты, раскрываются по клику. */
export function PlanLog({ task }: { task: Pick<CompanionTask, "planLog" | "planUsage"> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (task.planLog.length === 0) return null;
  return (
    <section className="companion-plan-log">
      <button type="button" className="companion-plan-log-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronRight size={12} className="companion-activity-chevron" />
        <span>{t("companion.planning.log")}</span>
        <span className="companion-plan-log-meta">
          {t("companion.planning.logCount", { count: task.planLog.length })}
          {task.planUsage.requests > 0 && (
            <>
              {" · "}
              <UsageLabel usage={task.planUsage} />
            </>
          )}
        </span>
      </button>
      {open && <ActivityFeed activities={task.planLog} live={false} />}
    </section>
  );
}
