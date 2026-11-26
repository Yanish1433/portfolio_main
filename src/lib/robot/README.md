# Robot engine

The free, offline "smart robot" buddy. It needs no AI service and no API key: it understands a visitor's message by matching it against the portfolio content, answers in a friendly voice, offers clickable suggestions, and can trigger actions such as "Follow me!".

Pure TypeScript. No React, no UI, no `node:*` imports, so it runs in the browser. The UI only depends on the `RobotBrain` interface, so a real LLM can replace the brain later.

```ts
import { createLocalBrain } from "@/lib/robot";
import { profile } from "@/content/profile";

const brain = createLocalBrain(profile);              // { seed } makes phrasing repeatable (tests)
const hello = brain.greet({ mode: "world" });
const reply = await brain.reply("whats ur edu", { mode: "world", currentZone: "plaza" });
// reply: { text, suggestions[2..4], actions?, intent, confidence }
```

The UI should:

- show `reply.text` and render `reply.suggestions` as chips (`message` is sent back to `brain.reply`, `action` is run directly),
- run `reply.actions` immediately (only explicit commands such as "take me to education" produce them),
- keep the history and pass it as `ctx.history`, and pass the latest offered action as `ctx.lastOffer` if it tracks one (the brain also remembers the last offer itself).

## Run the tests

No new packages. Node 24 strips TypeScript types itself, and `scripts/ts-resolve.mjs` is a small resolve hook that maps the `@/` alias and extensionless imports (so `tsc` and Next stay happy):

```bash
# all tests (robot + showcase helpers in src/content/showcase.test.ts):
node --no-warnings --import ./scripts/ts-resolve.mjs --test "src/**/*.test.ts"
# only the robot:
node --no-warnings --import ./scripts/ts-resolve.mjs --test "src/lib/robot/**/*.test.ts"
# a printed sample conversation:
node --no-warnings --import ./scripts/ts-resolve.mjs scripts/robot-transcript.ts
```

Keep the quotes around the glob on Windows. Library code may only use syntax Node can erase: no `enum`, `namespace`, parameter properties or `import x =`, and `import type` for type-only imports.

## How it works

| File | Job |
|---|---|
| `types.ts` | `RobotAction`, `RobotReply`, `RobotContext`, `RobotBrain`, `ZoneId`, `IntentId` |
| `text.ts` | normalise (lowercase, strip diacritics/punctuation, expand slang), stopwords, Damerau-Levenshtein, seeded RNG |
| `intents.ts` | intent data: weighted keywords and phrases, synonyms, ambiguous words |
| `matcher.ts` | entity detection from the profile, scoring, precedence, follow-up detection |
| `responses.ts` | answer builders (all text is built from `profile` data), recruiter-mode conversion |
| `brain.ts` | `createLocalBrain`: ties it together and holds the light memory |
| `index.ts` | public exports |

Precedence: navigate verb + zone > project name (or "second project") > skill/tech name > best scored intent. Below `FALLBACK_THRESHOLD` (0.3) the robot says it is not sure and never guesses. Typos are fuzzy-matched only for words of 4+ letters (distance 1 up to 5 letters, 2 above); shorter words must match exactly. Words like `go`, `next`, `c`, `rest` only count as skills with an exact match plus a cue such as "know" or "use".

Entities are read live from the profile: project names, skills, tech in project stacks, schools, companies, certificates, courses and the owner's name. Updating `profile.ts` updates the robot, and nothing about the owner is hard-coded. Replies avoid pronouns for the owner.

Recruiter mode (`ctx.mode === "recruiter"`): `walkTo` and `startTour` never appear, not in `actions` and not in `suggestions`. They become `openLink` with a `#section` anchor. The mapping is `RECRUITER_ANCHORS` in `responses.ts` (`#projects`, `#skills`, `#education`, `#contact`, plus `#experience` for the timeline and `#top` for the plaza, so edit them there if the recruiter page differs).

## Add an intent

1. Add the id to `IntentId` in `types.ts`.
2. Add an entry to `INTENTS` in `intents.ts` with `keywords` (single words, weights 1-5, never stopwords) and `phrases` (multi-word, matched on the normalised message). Put more specific intents earlier, because ties go to the earlier intent.
3. Add a `case` in `build()` in `responses.ts`. Build the text from `profile`, give 2-3 phrasing variants with `pick(rng, [...])`, keep it to about two sentences, and return 2-4 suggestions. Use `zoneAction(zone, mode)` for anything that moves the visitor, so recruiter mode stays safe. Return `offer` if the text asks "Want me to...?".
4. Add test rows to `TABLE` in `robot.test.ts`. The "covers every intent" test fails until you do, and the "no dead ends" test checks that every suggestion message you add is understood.

Need a new kind of thing to recognise (for example a hobby list in the profile)? Add it to `buildEntityIndex` and `analyze` in `matcher.ts`, then use it in `classify`.

## Swap in an LLM brain

Implement `RobotBrain`:

```ts
import type { RobotBrain, RobotContext, RobotReply } from "@/lib/robot";

export function createLlmBrain(): RobotBrain {
  return {
    async reply(message: string, ctx?: RobotContext): Promise<RobotReply> {
      // call your server route here (never put API keys in the browser), then map the result to a RobotReply:
      // text, 2-4 suggestions, optional actions, intent, confidence.
      throw new Error("not implemented");
    },
    greet(ctx?: RobotContext): RobotReply {
      throw new Error("not implemented");
    },
  };
}
```

The UI does not change. Keep the contract: 2-4 suggestions on every reply and no `walkTo`/`startTour` in recruiter mode. A sensible setup is a hybrid: call the local brain first and only ask the LLM when `reply.intent === "fallback"`.
