import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createEvaluator, type Evaluate } from "../src/jev.ts";
import { WatchedProcess, validateConditions, type Condition, type Observation } from "../src/watch.ts";

const conditions = Type.Array(Type.Object({
  id: Type.String({ pattern: "^[a-zA-Z0-9_-]{1,64}$" }),
  description: Type.String({ minLength: 1, maxLength: 1_000 }),
  threshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  contains: Type.Optional(Type.String({ minLength: 1, maxLength: 2_000, description: "Optional exact, case-sensitive output substring. Uses deterministic matching instead of Jev." })),
}), { minItems: 1, maxItems: 16 });
const timing = {
  timeoutMs: Type.Optional(Type.Integer({ minimum: 100, maximum: 3_600_000 })),
  intervalMs: Type.Optional(Type.Integer({ minimum: 100, maximum: 30_000 })),
};
const result = (observation: Observation) => ({ content: [{ type: "text" as const, text: JSON.stringify(observation, null, 2) }], details: observation });
const evaluator = (items: Condition[]): Evaluate => items.some(c => c.contains === undefined) ? createEvaluator() : async () => { throw new Error("No semantic conditions."); };

export default function semanticWatch(pi: ExtensionAPI) {
  const processes = new Map<string, WatchedProcess>();
  const get = (id: string) => {
    const process = processes.get(id);
    if (!process) throw new Error("Unknown process ID. Handles last only for this Pi session.");
    return process;
  };
  pi.on("session_shutdown", async () => {
    await Promise.all([...processes.values()].map(process => process.stop()));
    processes.clear();
  });
  pi.registerTool({
    name: "jev_watch", label: "Run with semantic conditions",
    description: "Start an executable and wait until agent-defined output conditions match, it exits, or the deadline expires. Ordinary progress does not return control. Returns exact observed output and a processId. On match or API/output error the process stays running; use jev_process to send input/stop, or jev_wait with new conditions. Timeout/cancellation kills it. No shell expansion: use an explicit shell executable for shell commands. Output and conditions are sent to TypeSafe for semantic matching.",
    promptSnippet: "Run a process until an agent-defined semantic output condition occurs.",
    promptGuidelines: ["Use jev_watch for unfamiliar long-running commands when you can describe output that requires your attention. Prefer exact contains conditions for known readiness markers. A semantic match is a judgment, not proof."],
    parameters: Type.Object({ command: Type.String({ minLength: 1 }), args: Type.Optional(Type.Array(Type.String())), cwd: Type.Optional(Type.String()), conditions, ...timing }),
    async execute(_id, params, signal, _update, ctx) {
      validateConditions(params.conditions);
      const evaluate = evaluator(params.conditions); // Missing key must not launch the command.
      signal?.throwIfAborted();
      for (const [id, process] of processes) if (process.ended.signal.aborted) { await process.stop(); processes.delete(id); }
      if (processes.size >= 4) throw new Error("Four watched processes are already active. Stop one first.");
      const process = new WatchedProcess(params.command, params.args ?? [], params.cwd ?? ctx.cwd);
      processes.set(process.id, process);
      return result(await process.wait(params, evaluate, signal));
    },
  });
  pi.registerTool({
    name: "jev_wait", label: "Wait for semantic conditions",
    description: "Wait on an existing jev_watch process with fresh temporary conditions. Observes buffered output since the previous wait plus limited overlap. Timeout/cancellation stops the process.",
    parameters: Type.Object({ processId: Type.String(), conditions, ...timing }),
    async execute(_id, params, signal) { return result(await get(params.processId).wait(params, evaluator(params.conditions), signal)); },
  });
  pi.registerTool({
    name: "jev_process", label: "Control watched process",
    description: "Read recent exact output, send stdin (include a newline to submit a line), or stop a watched process. Stop terminates its process tree. Handles are session-local.",
    parameters: Type.Object({ processId: Type.String(), action: Type.Union([Type.Literal("status"), Type.Literal("write"), Type.Literal("stop")]), input: Type.Optional(Type.String({ maxLength: 16_000 })) }),
    async execute(_id, params) {
      const process = get(params.processId);
      if (params.action === "write") {
        if (params.input === undefined) throw new Error("The write action requires input.");
        await process.write(params.input);
      }
      if (params.action === "stop") { await process.stop(); processes.delete(params.processId); return result(process.snapshot("stopped")); }
      return result(process.snapshot());
    },
  });
}
