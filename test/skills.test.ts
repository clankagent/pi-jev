import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { suggestSkill, type Candidate } from "../src/skills.ts";
import { validateAnswers, type Evaluate } from "../src/jev.ts";
import type { Questions, SystemOneResult } from "@typesafe-ai/sdk";

test("manual-only skills and explicit skill commands never trigger selection", async () => {
  const never: Evaluate = async () => { throw new Error("must not call"); };
  const skill = { name: "jev", description: "Jev docs", filePath: "unused", disableModelInvocation: true };
  assert.equal(await suggestSkill("What is Jev?", [skill], never), undefined);
  assert.equal(await suggestSkill("/skill:jev what is it?", [skill], never), undefined);
  assert.equal(await suggestSkill('<skill name="jev" location="x">\nbody\n</skill>', [skill], never), undefined);
});

test("ranks the catalog, verifies only top three, and returns the verified winner", async t => {
  const dir = await mkdtemp(join(tmpdir(), "pi-jev-skills-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const skills: Candidate[] = [];
  for (let i = 0; i < 4; i++) {
    const filePath = join(dir, `${i}.md`);
    await writeFile(filePath, `Instructions for skill ${i}`);
    skills.push({ name: `skill-${i}`, description: `description ${i}`, filePath, disableModelInvocation: false });
  }
  let calls = 0;
  const evaluate: Evaluate = async (state, questions): Promise<SystemOneResult<Questions>> => {
    calls++;
    if (calls === 1) {
      assert.equal(Object.keys(questions.rank.type === "choice" ? questions.rank.criteria : {}).length, 4);
      return { model: "test", usage: { input_tokens: 0, output_tokens: 0 }, answers: {
        rank: { type: "choice", choice: "s1", confidence: 0.9, probabilities: { s0: 0.2, s1: 0.5, s2: 0.2, s3: 0.1 } }, needed: { type: "noul", noul: 0.9 },
      } };
    }
    assert.match(JSON.stringify(state), /Instructions for skill 1/);
    assert.doesNotMatch(JSON.stringify(state), /Instructions for skill 3/);
    return { model: "test", usage: { input_tokens: 0, output_tokens: 0 }, answers: {
      winner: { type: "choice", choice: "s1", confidence: 0.8, probabilities: { none: 0.1, s0: 0.1, s1: 0.7, s2: 0.1 } },
      fits_s1: { type: "noul", noul: 0.95 }, fits_s0: { type: "noul", noul: 0.2 }, fits_s2: { type: "noul", noul: 0.2 },
    } };
  };
  assert.equal((await suggestSkill("Perform specialized work", skills, evaluate))?.name, "skill-1");
  assert.equal(calls, 2);
});

test("no-skill gate stops after the first call", async () => {
  let calls = 0;
  const evaluate: Evaluate = async () => {
    calls++;
    return { model: "test", usage: { input_tokens: 0, output_tokens: 0 }, answers: { needed: { type: "noul", noul: 0.1 } } };
  };
  assert.equal(await suggestSkill("hello", [{ name: "test", description: "test", filePath: "unused", disableModelInvocation: false }], evaluate), undefined);
  assert.equal(calls, 1);
});

test("invalid probabilities and out-of-catalog choices are rejected", () => {
  const base = { model: "test", usage: { input_tokens: 0, output_tokens: 0 } };
  assert.throws(() => validateAnswers({ ...base, answers: { a: { type: "noul", noul: Number.NaN } } }, { a: { type: "noul" } }));
  assert.throws(() => validateAnswers({ ...base, answers: { a: { type: "choice", choice: "invented", confidence: 1, probabilities: { allowed: 1 } } } }, { a: { type: "choice", criteria: { allowed: null } } }));
  assert.throws(() => validateAnswers({ ...base, answers: {} }, { a: { type: "noul" } }));
});

test("second stage can reject the entire shortlist or an uncertain winner", async t => {
  const dir = await mkdtemp(join(tmpdir(), "pi-jev-reject-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filePath = join(dir, "SKILL.md");
  await writeFile(filePath, "Applies only to editing spreadsheets.");
  for (const choice of ["none", "s0"]) {
    const evaluate: Evaluate = async (_state, questions): Promise<SystemOneResult<Questions>> => ({
      model: "test", usage: { input_tokens: 0, output_tokens: 0 },
      answers: questions.rank ? {
        rank: { type: "choice", choice: "s0", confidence: 1, probabilities: { s0: 1 } }, needed: { type: "noul", noul: 0.9 },
      } : {
        winner: { type: "choice", choice, confidence: 0.8, probabilities: { none: choice === "none" ? 0.9 : 0.1, s0: choice === "s0" ? 0.9 : 0.1 } },
        fits_s0: { type: "noul", noul: 0.2 },
      },
    });
    assert.equal(await suggestSkill("Explain a spreadsheet", [{ name: "sheet", description: "Edit sheets", filePath, disableModelInvocation: false }], evaluate), undefined);
  }
});
