import { AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Console, Effect, Layer } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { GitContext } from "../domain/CommitMessage.ts";
import { CommitAi } from "../services/CommitAi.ts";
import { Git } from "../services/Git.ts";

export const commit = Command.make(
    "commit",
    {
        model: Flag.string("model").pipe(
            Flag.withAlias("m"),
            Flag.withDefault("claude-sonnet-4-20250514"),
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

            // 2. Generate commit message
            yield* Console.log("Generating commit message...");
            const msg = yield* commitAi.generate(context);

            // 3. Display formatted message
            yield* Console.log("");
            yield* Console.log(msg.subjectLine);
            yield* Console.log("");
            yield* Console.log(msg.body);
            yield* Console.log("");

            // 4. Confirm
            const confirmed = yield* Prompt.confirm({ message: "Commit with this message?" });
            if (!confirmed) {
                yield* Console.log("Cancelled.");
                return;
            }

            // 5. Commit
            yield* git.commit(msg.subjectLine, msg.body);
            yield* Console.log("Committed.");
        }).pipe(
            Effect.provide(
                CommitAi.layer.pipe(Layer.provide(AnthropicLanguageModel.model(config.model))),
            ),
            Effect.catchTag("GitError", (error) => Console.error(error.message)),
            Effect.catchTag("CommitAiError", (error) => Console.error(`AI error: ${error.message}`)),
        ),
).pipe(Command.withDescription("Generate and create a conventional commit from staged changes"));
