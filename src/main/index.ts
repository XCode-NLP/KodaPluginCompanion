import type { Json, PluginContext } from "@kodadev/desktop-plugin-sdk";
import { setUiLanguage } from "../shared/i18n";
import type { CompanionPluginSettings } from "../shared/companionTypes";
import type { CompanionService } from "./companionService";
import { COMPANION_UI_METHODS, createCompanionService } from "./plugin";

let service: CompanionService | null = null;
/** Выбранная задача общая для двух страниц: списка слева и задачи справа. */
let selected: string | null = null;

export default {
  async activate(ctx: PluginContext) {
    setUiLanguage(ctx.env.language);
    const companion = createCompanionService(ctx);
    service = companion;
    for (const method of COMPANION_UI_METHODS) {
      ctx.ui.handle(method, async (params) => {
        const args = (params as { args?: unknown[] } | null)?.args ?? [];
        const call = companion[method] as (...values: unknown[]) => unknown;
        return ((await call.apply(companion, args)) ?? null) as Json;
      });
    }
    ctx.ui.handle("select", async (params) => {
      const taskId = (params as { taskId?: unknown } | null)?.taskId;
      selected = typeof taskId === "string" ? taskId : null;
      await ctx.ui.post("selected", { taskId: selected });
      return null;
    });
    ctx.ui.handle("selection", async () => ({ taskId: selected }));
    ctx.ui.handle("openNew", async (params) => {
      const kind = (params as { kind?: unknown } | null)?.kind === "sandbox" ? "sandbox" : "project";
      await ctx.ui.post("openNew", { kind });
      return null;
    });
    ctx.ui.handle("settings", async () => (await ctx.settings.get()) as unknown as Json);
    ctx.ui.handle("projects", async () => (await ctx.projects.list()) as unknown as Json);
    ctx.settings.onChange((settings) => void ctx.ui.post("settings", settings as Partial<CompanionPluginSettings> as Json));
  },
  async deactivate() {
    await service?.dispose();
    service = null;
  },
};
