import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { WatchedProcess } from "../src/watch.ts";
import type { Evaluate } from "../src/jev.ts";

const conditions = [{ id: "ready", description: "The application is ready" }, { id: "input", description: "The application requests input" }];
const never: Evaluate = async () => { throw new Error("Should not evaluate"); };
function processFor(code: string) { return new WatchedProcess(process.execPath, ["-e", code], process.cwd()); }
const answer: Evaluate = async (_state, questions) => ({ model: "test", usage: { input_tokens: 0, output_tokens: 0 }, answers: Object.fromEntries(Object.keys(questions).map(id => [id, { type: "noul", noul: id === "c0" ? 0.95 : 0.1 }])) });

test("batches semantic questions, returns exact evidence, keeps process running", async t => {
  const process = processFor("console.log('server online'); setInterval(()=>{}, 1000)");
  t.after(() => process.stop());
  let calls = 0;
  const result = await process.wait({ conditions, intervalMs: 100, timeoutMs: 3000 }, async (state, questions, signal) => {
    calls++;
    assert.equal(Object.keys(questions).length, 2);
    return answer(state, questions, signal);
  });
  assert.equal(result.status, "matched");
  assert.equal(result.running, true);
  assert.match(result.evidence!, /server online/);
  assert.deepEqual(result.matches, [{ id: "ready", probability: 0.95, method: "jev" }]);
  assert.equal(calls, 1);
});

test("exact split-chunk matching takes precedence and stdin can continue a process", async t => {
  const process = processFor("process.stdout.write('rea'); setTimeout(()=>process.stdout.write('dy'),200); process.stdin.on('data',()=>{console.log('accepted');});");
  t.after(() => process.stop());
  const result = await process.wait({ conditions: [{ id: "ready", description: "ready", contains: "ready" }], intervalMs: 100, timeoutMs: 3000 }, never);
  assert.equal(result.status, "matched");
  assert.equal(result.matches![0].method, "exact");
  await process.write("hello\n");
  const next = await process.wait({ conditions: [{ id: "accepted", description: "accepted", contains: "accepted" }], intervalMs: 100, timeoutMs: 3000 }, never);
  assert.equal(next.status, "matched");
});

test("silence makes no API calls and timeout terminates the process", async () => {
  const process = processFor("setInterval(()=>{},1000)");
  const result = await process.wait({ conditions, timeoutMs: 200, intervalMs: 100 }, never);
  assert.equal(result.status, "timeout");
  assert.equal(result.running, false);
});

test("cancellation terminates process and cancels an in-flight evaluation", async () => {
  const process = processFor("console.log('working'); setInterval(()=>{},1000)");
  const cancel = new AbortController();
  const result = await process.wait({ conditions, timeoutMs: 3000, intervalMs: 100 }, async (_state, _questions, signal) => {
    cancel.abort();
    await delay(5000, undefined, { signal });
    throw new Error("unreachable");
  }, cancel.signal);
  assert.equal(result.status, "cancelled");
  assert.equal(result.running, false);
});

test("exit outranks a late semantic result", async () => {
  const process = processFor("console.log('working'); setTimeout(()=>process.exit(7), 300)");
  const result = await process.wait({ conditions, intervalMs: 100 }, async (state, questions, signal) => {
    await delay(1000, undefined, { signal });
    return answer(state, questions, signal);
  });
  assert.equal(result.status, "exited");
  assert.equal(result.exitCode, 7);
});

test("API failure returns control with evidence and a live process", async t => {
  const process = processFor("console.log('working'); setInterval(()=>{},1000)");
  t.after(() => process.stop());
  const result = await process.wait({ conditions, intervalMs: 100 }, never);
  assert.equal(result.status, "error");
  assert.equal(result.running, true);
  assert.match(result.evidence!, /working/);
  assert.doesNotMatch(result.error!, /Should not evaluate/);
});

test("output floods are bounded and reported instead of silently dropping conditions", async t => {
  const process = processFor("process.stdout.write('x'.repeat(500000)); setInterval(()=>{},1000)");
  t.after(() => process.stop());
  await delay(400);
  const result = await process.wait({ conditions }, never);
  assert.equal(result.status, "output_limit");
  assert.equal(result.outputTruncated, true);
  assert.ok(result.output.length <= 32000);
});

test("spawn failures return immediately with a useful error", async () => {
  const watched = new WatchedProcess("pi-jev-nonexistent-executable-123", [], process.cwd());
  const result = await watched.wait({ conditions, intervalMs: 100 }, never);
  assert.equal(result.status, "error");
  assert.equal(result.running, false);
});
