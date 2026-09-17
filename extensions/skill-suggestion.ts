import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createEvaluator } from "../src/jev.ts";
import { suggestSkill } from "../src/skills.ts";

export default function skillSuggestion(pi: ExtensionAPI) {
  let enabled = process.env.PI_JEV_SKILLS !== "0";
  let active: AbortController | undefined;
  pi.registerCommand("jev-skill-suggestions", {
    description: "Toggle Jev skill suggestions: /jev-skill-suggestions on|off|status",
    handler: async (args, ctx) => {
      if (args.trim() === "on") enabled = true;
      else if (args.trim() === "off") { enabled = false; active?.abort(); }
      ctx.ui.notify(`Jev skill suggestions: ${enabled ? "on" : "off"}. ${process.env.TYPESAFE_API_KEY ? "API key set." : "Set TYPESAFE_API_KEY to activate."}`, "info");
    },
  });
  pi.on("session_shutdown", async () => { active?.abort(); });
  pi.on("before_agent_start", async (event, ctx) => {
    const options = event.systemPromptOptions;
    if (!options) return; // Older Pi versions have no structured skill catalog.
    if (!enabled || !process.env.TYPESAFE_API_KEY) return;
    active?.abort();
    const controller = new AbortController();
    active = controller;
    try {
      const suggestion = await suggestSkill(event.prompt, options.skills ?? [], createEvaluator(), controller.signal);
      if (suggestion && !controller.signal.aborted) {
        return { systemPrompt: event.systemPrompt + `\n\n<pi_jev_skill>\nJev suggests considering the installed skill ${JSON.stringify(suggestion.name)} for this request. Read its SKILL.md from the available skill catalog only if its scope fits. This is a suggestion; retain your own judgment and follow explicit user skill choices.\n</pi_jev_skill>` };
      }
    } catch {
      if (!controller.signal.aborted) ctx.ui.notify("Jev skill selection unavailable; continuing with Pi's normal skill selection.", "warning");
    } finally { if (active === controller) active = undefined; }
  });
}
