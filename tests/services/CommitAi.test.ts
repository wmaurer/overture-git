import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Stream } from "effect";
import { LanguageModel } from "effect/unstable/ai";

import { CommitMessage, GitContext } from "../../src/domain/CommitMessage.ts";
import { CommitAi } from "../../src/services/CommitAi.ts";

const makeCommitJson = (overrides: Partial<{ type: string; scope: string; subject: string; bullets: string[] }> = {}) =>
    JSON.stringify({
        type: overrides.type ?? "feat",
        scope: overrides.scope ?? "cli",
        subject: overrides.subject ?? "add commit command",
        bullets: overrides.bullets ?? ["Add AI-powered commit message generation"],
    });

let callCount = 0;

const TestModelLayer = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
        generateText: ({ prompt }) => {
            callCount++;
            const promptStr = JSON.stringify(prompt);
            const hasSystem = promptStr.includes("git commit message generator");
            const hasDiff = promptStr.includes("test diff content");

            if (!hasSystem || !hasDiff) {
                return Effect.die("Prompt missing expected content");
            }

            // On second call, return a different message to prove regeneration works
            const json = callCount === 1
                ? makeCommitJson()
                : makeCommitJson({ type: "fix", subject: "resolve commit issue", scope: undefined });

            return Effect.succeed([
                { type: "text" as const, text: json },
                {
                    type: "finish" as const,
                    reason: "stop" as const,
                    usage: {
                        inputTokens: { uncached: 100, total: 100, cacheRead: 0, cacheWrite: 0 },
                        outputTokens: { total: 50, text: undefined, reasoning: undefined },
                    },
                    response: undefined,
                },
            ]);
        },
        streamText: () => Stream.die("not implemented"),
    }),
);

const TestCommitAiLayer = Layer.merge(CommitAi.layer, TestModelLayer);

const testContext = new GitContext({
    diff: "test diff content",
    branch: "main",
    recentCommits: "abc123 initial commit",
    status: "M src/index.ts",
});

describe("CommitAi", () => {
    it.effect("createChat returns a chat that generates a structured commit message", () =>
        Effect.gen(function* () {
            const commitAi = yield* CommitAi;
            const chat = yield* commitAi.createChat(testContext);
            const response = yield* chat.generateObject({
                objectName: "commit_message",
                prompt: [],
                schema: CommitMessage,
            });
            expect(response.value.type).toBe("feat");
            expect(response.value.subjectLine).toBe("feat(cli): add commit command");
            expect(response.value.bullets).toHaveLength(1);
        }).pipe(Effect.provide(TestCommitAiLayer)),
    );

    it.effect("regeneration via chat includes conversation history", () =>
        Effect.gen(function* () {
            callCount = 0;
            const commitAi = yield* CommitAi;
            const chat = yield* commitAi.createChat(testContext);

            // First generation
            const first = yield* chat.generateObject({
                objectName: "commit_message",
                prompt: [],
                schema: CommitMessage,
            });
            expect(first.value.type).toBe("feat");

            // Regeneration — chat history includes the first attempt
            const second = yield* chat.generateObject({
                objectName: "commit_message",
                prompt: [{ role: "user" as const, content: "use fix type instead" }],
                schema: CommitMessage,
            });
            expect(second.value.type).toBe("fix");
            expect(callCount).toBe(2);
        }).pipe(Effect.provide(TestCommitAiLayer)),
    );
});
