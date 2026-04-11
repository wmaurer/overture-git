import { AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Console, Effect, Layer } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { CommitMessage, GitContext } from "../domain/CommitMessage.ts";
import { CommitAi } from "../services/CommitAi.ts";
import { Git } from "../services/Git.ts";

type Action = "commit" | "regenerate" | "regenerate_with_feedback" | "cancel";

const actionMenu = Prompt.select<Action>({
    message: "What would you like to do?",
    choices: [
        { title: "Commit", value: "commit" },
        { title: "Regenerate", value: "regenerate" },
        { title: "Regenerate with feedback", value: "regenerate_with_feedback" },
        { title: "Cancel", value: "cancel" },
    ],
});

const displayMessage = (msg: CommitMessage) =>
    Effect.gen(function* () {
        yield* Console.log("");
        yield* Console.log(msg.subjectLine);
        yield* Console.log("");
        yield* Console.log(msg.body);
        yield* Console.log("");
    });

export const commit = Command.make(
    "commit",
    {
        model: Flag.string("model").pipe(
            Flag.withAlias("m"),
            Flag.withDefault("claude-haiku-4-5-20251001"),
            Flag.withDescription("Anthropic model to use"),
        ),
    },
    (config) =>
        Effect.gen(function* () {
            const git = yield* Git;
            const commitAi = yield* CommitAi;

            // 1. Gather context in parallel
            const [diff, branch, status, recentCommits] = yield* Effect.all([
                git.diffStaged(),
                git.branch(),
                git.status(),
                git.log(10),
            ]);

            const context = new GitContext({ diff, branch, status, recentCommits });

            // 2. Create chat session
            const chat = yield* commitAi.createChat(context);

            // 3. Generate-review loop
            let prompt: Array<{ role: "user"; content: string }> = [];

            while (true) {
                yield* Console.log("Generating commit message...");
                const response = yield* chat.generateObject({
                    objectName: "commit_message",
                    prompt,
                    schema: CommitMessage,
                });
                const msg = response.value;

                yield* displayMessage(msg);

                const action: Action = yield* actionMenu;

                if (action === "commit") {
                    yield* git.commit(msg.subjectLine, msg.body);
                    yield* Console.log("Committed.");
                    return;
                }

                if (action === "cancel") {
                    yield* Console.log("Cancelled.");
                    return;
                }

                if (action === "regenerate_with_feedback") {
                    const feedback = yield* Prompt.text({
                        message: "What should be different?",
                    });
                    prompt = [{ role: "user", content: feedback }];
                } else {
                    // Plain regenerate — let the model try again with history context
                    prompt = [{ role: "user", content: "Please try a different commit message." }];
                }
            }
        }).pipe(
            Effect.provide(Layer.merge(CommitAi.layer, AnthropicLanguageModel.model(config.model))),
            Effect.catchTag("GitError", (error) => Console.error(error.message)),
            Effect.catchTag("CommitAiError", (error) => Console.error(`AI error: ${error.message}`)),
        ),
).pipe(Command.withDescription("Generate and create a conventional commit from staged changes"));
