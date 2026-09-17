# pi-jev

Two [Pi](https://pi.dev/) extensions powered by [Jev / TypeSafe](https://docs.typesafe.ai/introduction):

1. **Semantic process conditions:** the agent describes output worth waiting for; Jev evaluates those conditions together while the process runs. A match returns control with the original output.
2. **Skill suggestion:** Jev ranks Pi's enabled skills, checks the top three more closely, and suggests one or none for the current request. The agent retains its own judgment.

Also includes a small, **user-invoked-only** documentation skill: `/skill:jev`.

## Install

Requires Node.js 22.19+ and Pi 0.85.1+ (`@earendil-works/pi-coding-agent`). Tested with Pi 0.85.1. Earlier `@mariozechner` Pi releases are not supported.

```sh
pi install git:github.com/clankagent/pi-jev@v0.1.0
```

Set `TYPESAFE_API_KEY` in the environment of the process that launches Pi. For example, after setting it through your shell or secret manager, start `pi`. Never put the key in a prompt or skill file. The package reads this environment variable directly; no configuration file is required.

Run `/reload` in an existing Pi session after installation. The default model is `jev-latest`; optionally set `PI_JEV_MODEL` to a versioned model ID. The API endpoint is fixed to `https://api.typesafe.ai`. SDK debug logging is disabled.

Each extension can be disabled independently with Pi's `pi config`. `/jev-skills on`, `/jev-skills off`, and `/jev-skills status` control suggestions for the current session. `PI_JEV_SKILLS=0` disables them at startup. Without an API key, suggestions are inactive and semantic watches fail before launching a command. Exact-only watches need no key.

## 1. Agent-defined process conditions

Ask Pi something like:

> Start the development server with jev_watch. Wait until it is ready, requests interactive input, reports a missing credential, or reports a port collision. Keep it running when ready.

The agent calls `jev_watch` with an executable and argument array. No implicit shell runs. To use pipelines or shell built-ins, explicitly launch `bash -lc`, `pwsh -NoProfile -Command`, or another shell.

Example tool arguments (Node.js demo, works on Windows/macOS/Linux when `node` is on PATH):

```json
{
  "command": "node",
  "args": ["-e", "console.log('Listening on port 3000'); setInterval(() => {}, 1000)"],
  "conditions": [
    { "id": "ready", "description": "The application announces it is ready to accept connections" },
    { "id": "input", "description": "The application asks the user to enter a response" },
    { "id": "credential", "description": "A required credential is missing" },
    { "id": "port", "description": "The requested port or address is already in use" }
  ],
  "timeoutMs": 120000
}
```

The tool stays pending through ordinary progress. No extra main-model turns or agent polling are required. It returns on a match, process exit, cancellation, deadline, or evaluation failure. This is a foreground tool wait, not an autonomous background agent or a monitor for unrelated Pi tools.

| Tool | Purpose |
| --- | --- |
| `jev_watch` | Launch a process and wait for temporary conditions. Optional `cwd`; otherwise Pi's working directory. |
| `jev_wait` | Wait on the returned `processId` with another set of conditions. |
| `jev_process` | `status` reads recent output; `write` sends `input` to stdin; `stop` terminates the process tree. |

When sending a line to a program, include `\n` in `input`. Programs requiring a real terminal/PTY are not supported; stdin/stdout/stderr are pipes. Use Pi's terminal tools for those programs.

Conditions have a unique `id`, a plain-language `description`, and an optional probability `threshold` (default **0.85**). Set `contains` for a known, case-sensitive marker: that condition uses exact substring matching and skips Jev. Exact matches, process exit, and cancellation take precedence over semantic matching. All semantic conditions in a window are submitted in **one call**. These probabilities are judgments, not guarantees.

Matches include the original evaluated `evidence`, matching condition IDs, probabilities, and matching method. Output is the observed interleaving of stdout and stderr, without a generated summary; cross-stream ordering is not guaranteed.

### Lifecycle and limits

- A match leaves the process running. Use its handle to continue, send input, or stop it. API errors also return control with the process available. There are no automatic recovery commands.
- Timeout (default 2 minutes; maximum 1 hour) or cancellation stops the process tree. Session shutdown, reload, or replacement cleans up tracked processes. Handles do not survive sessions; completed handles may be discarded when a new process starts.
- Up to 4 tracked active processes and 16 conditions per wait. Only one wait per process at a time.
- Evaluation interval defaults to 1 second, plus API latency. Silent processes make no API calls. Requests have a 12-second total budget and at most one SDK retry.
- Each evaluation reads up to 16,000 characters with 2,000 characters of overlap. Recent output is capped at 32,000 characters; `outputTruncated` indicates clipping. Conditions spanning more than a window can be missed. Re-waiting can match overlapping old output; supply conditions for the next event.
- An unevaluated backlog above 128,000 characters returns `output_limit`, explicitly reporting that conditions may have been missed. It resets the backlog and leaves the process running for inspection or another wait.
- Run foreground processes. Detached/daemonized descendants can escape ordinary process-tree cleanup, especially if their parent has already exited. A hard VM/process crash cannot run cleanup.

## 2. Skill suggestion

Before a normal agent run, the extension reads Pi's actual loaded skill catalog. It excludes every skill with `disable-model-invocation: true`, including this package's Jev documentation skill.

1. One TypeSafe request ranks eligible names/descriptions and separately asks whether any skill applies. A yes probability below 0.6 produces no suggestion.
2. Read at most 8,000 bytes from each of the top three skill files. A second request chooses one or `none` and checks each candidate's fit.
3. Add a short suggestion to this turn's system prompt only when the winner's fit probability is at least 0.7 and its choice confidence is at least 0.5. Pi's full catalog remains intact; the extension does not execute or inject skill bodies.

Explicit `/skill:name` invocations bypass selection. Missing/unreadable candidates are skipped. Requests over 24,000 characters, catalogs over 500 eligible skills, or catalog metadata over 200,000 characters skip suggestions rather than partially ranking the request. Selection failures leave Pi's normal behavior in place and show a warning. Thresholds are engineering defaults, not independently calibrated accuracy claims.

The design is inspired by TypeSafe's [skill-suggestion cookbook](https://docs.typesafe.ai/cookbooks/skill_suggestion). Its vendor benchmark is not a measured result for this package. Selection uses the current prompt and skill catalog, not the full conversation history.

## Ask about Jev

```text
/skill:jev What does Jev do, and how is it different from a reasoning model?
/skill:jev How do Noul questions and confidence work?
```

The skill carries a short introduction and links to specific official documentation pages. It asks the agent to fetch only relevant pages. Pi's `disable-model-invocation: true` hides it from the automatic skill prompt while keeping `/skill:jev` available.

## Data sent to TypeSafe

Semantic watches send evaluated process output windows and condition descriptions. Skill suggestion sends the current prompt, eligible skill names/descriptions, and the shortlisted excerpts. Do not use either feature on content you do not want sent to TypeSafe. Exact-only watches make no TypeSafe requests. The package does not log API keys, raw HTTP errors, or evaluation payloads to disk; returned process output follows Pi's ordinary transcript behavior.

## Development

```sh
pnpm install --ignore-scripts
pnpm check
pnpm test
```

Tests use synthetic process output and fake evaluator responses, plus Pi's real package/resource loader. They require no paid API calls. No live Jev quality benchmark is implied. Source TypeScript is loaded directly by Pi; no build step is needed. Contributions to this repository can be submitted as ordinary PRs; include relevant tests for behavior changes. This is an independent package, not an official Pi or TypeSafe integration.

## License

[Unlicense](LICENSE). Third-party dependencies retain their own licenses.
