---
name: jev
description: Answer user-invoked questions about Jev and TypeSafe using the official documentation.
disable-model-invocation: true
license: Unlicense
---

# Jev documentation

Use only when the user explicitly invokes `/skill:jev`. Jev is TypeSafe's model for fast, typed judgments over supplied state. It answers choice, rubric score, and yes/no probability questions, including several questions in one request.

Read the specific official page relevant to the user's question, then answer with a link. Fetch it using the browsing or HTTP tools available in this Pi session. If retrieval fails, say so and provide the relevant link; do not invent current API details, prices, or performance claims.

- [What Jev is](https://docs.typesafe.ai/introduction)
- [How System One works](https://docs.typesafe.ai/concepts/system-one)
- [Designing narrow judgments](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)
- [Supplying state](https://docs.typesafe.ai/concepts/state)
- [Question types](https://docs.typesafe.ai/primitives): [Choice](https://docs.typesafe.ai/primitives/choice), [Score](https://docs.typesafe.ai/primitives/score), [Noul](https://docs.typesafe.ai/primitives/noul)
- [Confidence](https://docs.typesafe.ai/confidence)
- [Quick start](https://docs.typesafe.ai/introduction/quickstart), [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript), [HTTP API](https://docs.typesafe.ai/api)
- [Models, pricing, and rate limits](https://docs.typesafe.ai/models)
- [Skill selection example](https://docs.typesafe.ai/cookbooks/skill_suggestion)
- [Batching independent questions](https://docs.typesafe.ai/patterns/fan-out)
- [Full documentation index](https://docs.typesafe.ai/llms.txt)

For questions about this package's tools and configuration, read the package [README](../../README.md). API credentials come from `TYPESAFE_API_KEY`; never ask the user to put a key in a prompt.
