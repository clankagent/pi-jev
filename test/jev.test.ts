import test from "node:test";
import assert from "node:assert/strict";
import { createEvaluator } from "../src/jev.ts";

test("SDK sends batched questions and environment authentication to the documented endpoint", async t => {
  const previous = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "synthetic-test-key";
  t.after(() => { if (previous === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = previous; });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls++;
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(new Headers(options.headers).get("authorization"), "Bearer synthetic-test-key");
    const body = JSON.parse(String(options.body));
    assert.equal(body.model, process.env.PI_JEV_MODEL || "jev-latest");
    assert.deepEqual(Object.keys(body.questions), ["a", "b"]);
    return Response.json({ model: "test", answers: { a: { type: "noul", noul: 0.9 }, b: { type: "noul", noul: 0.1 } }, usage: { input_tokens: 1, output_tokens: 1 } });
  });
  const result = await createEvaluator()({ output: "ready" }, { a: { type: "noul" }, b: { type: "noul" } });
  assert.equal(result.answers.a.type, "noul");
  assert.equal(calls, 1);
});

test("authentication failures do not expose response bodies", async t => {
  const previous = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "synthetic-test-key";
  t.after(() => { if (previous === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = previous; });
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "secret-server-body" }, { status: 401 }));
  await assert.rejects(createEvaluator()("state", { a: { type: "noul" } }), error => {
    assert.equal((error as Error).message, "TypeSafe request failed (HTTP 401).");
    return true;
  });
});

test("missing API key fails before any request", t => {
  const previous = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  t.after(() => { if (previous !== undefined) process.env.TYPESAFE_API_KEY = previous; });
  assert.throws(createEvaluator, /Set TYPESAFE_API_KEY/);
});
