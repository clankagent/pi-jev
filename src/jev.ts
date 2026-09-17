import { APIError, TypeSafeClient, type EntryType, type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

export type Evaluate = (state: EntryType, questions: Questions, signal?: AbortSignal) => Promise<SystemOneResult<Questions>>;

export function createEvaluator(): Evaluate {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) throw new Error("Set TYPESAFE_API_KEY in the environment before using pi-jev.");
  const client = new TypeSafeClient({
    apiKey, baseURL: "https://api.typesafe.ai", logLevel: "off",
    defaultModel: process.env.PI_JEV_MODEL || "jev-latest",
    timeout: 8_000, retry: { maxRetries: 1, maxRetryAfterMs: 1_000 },
  });
  return async (state, questions, signal) => {
    try {
      const result = await client.systemOne({ state, questions }, {
        signal: AbortSignal.any([AbortSignal.timeout(12_000), ...(signal ? [signal] : [])]),
      });
      validateAnswers(result, questions);
      return result;
    } catch (error) {
      if (signal?.aborted) throw new Error("Jev evaluation cancelled.");
      // SDK errors can contain response bodies. Never forward them into a transcript.
      if (error instanceof APIError) throw new Error(`TypeSafe request failed (HTTP ${error.status}).`);
      throw new Error("TypeSafe evaluation failed, timed out, or returned invalid answers.");
    }
  };
}

export function validateAnswers(result: SystemOneResult<Questions>, questions: Questions): void {
  const probability = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
  for (const [id, question] of Object.entries(questions)) {
    const answer = result?.answers?.[id];
    if (!answer || answer.type !== question.type) throw new Error("Invalid answer type.");
    if (answer.type === "noul") {
      if (!probability(answer.noul)) throw new Error("Invalid probability.");
    } else if (answer.type === "choice" && question.type === "choice") {
      if (!Object.hasOwn(question.criteria, answer.choice) || !probability(answer.confidence)) throw new Error("Invalid choice.");
      const values = Object.keys(question.criteria).map(key => answer.probabilities?.[key]);
      if (!values.every(probability) || Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 0.02) throw new Error("Invalid distribution.");
    }
  }
}

export function yes(result: SystemOneResult<Questions>, id: string): number {
  const answer = result.answers[id];
  if (answer?.type !== "noul") throw new Error("Expected a yes/no answer.");
  return answer.noul;
}
