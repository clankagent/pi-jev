import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DefaultResourceLoader, SettingsManager, formatSkillsForPrompt } from "@earendil-works/pi-coding-agent";

test("published Pi loads the package's two extensions and keeps Jev skill manual-only", async t => {
  const dir = await mkdtemp(join(tmpdir(), "pi-jev-package-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const settings = SettingsManager.inMemory({ packages: [resolve(".")] });
  const loader = new DefaultResourceLoader({ cwd: dir, agentDir: join(dir, "agent"), settingsManager: settings, noContextFiles: true });
  await loader.reload();
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 2);
  const tools = loaded.extensions.flatMap(extension => [...extension.tools.keys()]);
  assert.deepEqual(tools.sort(), ["jev_process", "jev_wait", "jev_watch"]);
  const skills = loader.getSkills();
  assert.deepEqual(skills.diagnostics, []);
  assert.equal(skills.skills.length, 1);
  assert.equal(skills.skills[0].name, "jev");
  assert.equal(skills.skills[0].disableModelInvocation, true);
  assert.equal(formatSkillsForPrompt(skills.skills), "");
});
