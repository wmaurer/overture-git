import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Stream } from "effect";
import { LanguageModel } from "effect/unstable/ai";

import { GitContext } from "../../src/domain/CommitMessage.ts";
import * as CommitAi from "../../src/services/CommitAi.ts";

// The mock LanguageModel provider returns a text part with JSON matching the CommitMessage schema.
// LanguageModel.make takes provider-level generateText/streamText functions.
// generateObject internally calls generateText, collects text parts, then decodes the JSON through the schema.
const TestModelLayer = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
        generateText: ({ prompt }) => {
            // Verify the prompt contains our expected content
            const promptStr = JSON.stringify(prompt);
            const hasSystem = promptStr.includes("git commit message generator");
            const hasDiff = promptStr.includes("test diff content");

            if (!hasSystem || !hasDiff) {
                return Effect.die("Prompt missing expected content");
            }

            // Return a text part with JSON matching CommitMessage schema
            // and a finish part — this is what generateObject extracts from
            return Effect.succeed([
                {
                    type: "text" as const,
                    text: JSON.stringify({
                        type: "feat",
                        scope: "cli",
                        subject: "add commit command",
                        bullets: ["Add AI-powered commit message generation"],
                    }),
                },
                {
                    type: "finish" as const,
                    reason: "stop" as const,
                    usage: {
                        inputTokens: {
                            uncached: 100,
                            total: 100,
                            cacheRead: 0,
                            cacheWrite: 0,
                        },
                        outputTokens: { total: 50, text: undefined, reasoning: undefined },
                    },
                    response: undefined,
                },
            ]);
        },
        streamText: () => Stream.die("not implemented"),
    }),
);

const testContext = new GitContext({
    diff: "test diff content",
    branch: "main",
    recentCommits: "abc123 initial commit",
    status: "M src/index.ts",
});

describe("CommitAi", () => {
    it.effect("generates a structured commit message", () =>
        Effect.gen(function* () {
            const msg = yield* CommitAi.generate(testContext);
            expect(msg.type).toBe("feat");
            expect(msg.subjectLine).toBe("feat(cli): add commit command");
            expect(msg.bullets).toHaveLength(1);
        }).pipe(Effect.provide(TestModelLayer)),
    );
});
