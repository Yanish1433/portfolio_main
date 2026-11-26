// Prints a sample conversation with the local robot brain.
// Run: node --no-warnings --import ./scripts/ts-resolve.mjs scripts/robot-transcript.ts
import { profile } from "@/content/profile";
import { createLocalBrain } from "@/lib/robot";
import type { RobotContext } from "@/lib/robot";

const brain = createLocalBrain(profile, { seed: 42 });
const ctx: RobotContext = { mode: "world" };

const messages = [
  "hi",
  "who r u",
  "show me ur projcts",
  "the second one",
  "do you know react?",
  "whats ur edu",
  "yes",
  "do u know python",
  "i'm in a hurry",
  "thanks, bye!",
];

console.log(`robot> ${brain.greet(ctx).text}\n`);
for (const message of messages) {
  const r = await brain.reply(message, ctx);
  console.log(`you>   ${message}`);
  console.log(`robot> ${r.text}`);
  console.log(`       [${r.intent}, confidence ${r.confidence.toFixed(2)}]`);
  if (r.actions) console.log(`       actions: ${JSON.stringify(r.actions)}`);
  console.log(`       suggestions: ${r.suggestions.map((s) => s.label).join(" | ")}\n`);
}
