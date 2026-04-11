import { AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Console, Effect, Layer } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { CommitMessage, GitContext } from "../domain/CommitMessage.ts";
import { parseEditedMessage } from "../domain/parseEditedMessage.ts";
import { CommitAi } from "../services/CommitAi.ts";
import { Editor } from "../services/Editor.ts";
import { Git } from "../services/Git.ts";

type Action = "commit" | "regenerate" | "regenerate_with_feedback" | "edit" | "cancel";

const actionMenu = Prompt.select<Action>({
    message: "What would you like to do?",
    choices: [
        { title: "Commit", value: "commit" },
        { title: "Edit", value: "edit" },
        { title: "Regenerate", value: "regenerate" },
        { title: "Regenerate with feedback", value: "regenerate_with_feedback" },
        { title: "Cancel", value: "cancel" },
    ],
});

const displayRaw = (m: { subject: string; body: string }) =>
    Effect.gen(function* () {
        yield* Console.log("");
        yield* Console.log(m.subject);
        yield* Console.log("");
        yield* Console.log(m.body);
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
            const editor = yield* Editor;

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

            // 3. Initial generation
            yield* Console.log("Generating commit message...");
            let prompt: Array<{ role: "user"; content: string }> = [];
            const initial = yield* chat.generateObject({ objectName: "commit_message", prompt, schema: CommitMessage });
            let current = { subject: initial.value.subjectLine, body: initial.value.body };
            yield* displayRaw(current);

            // 4. Action loop
            while (true) {
                const action: Action = yield* actionMenu;

                if (action === "commit") {
                    yield* git.commit(current.subject, current.body);
                    yield* Console.log("Committed.");
                    return;
                }

                if (action === "cancel") {
                    yield* Console.log("Cancelled.");
                    return;
                }

                if (action === "edit") {
                    const edited = yield* editor.open(`${current.subject}\n\n${current.body}`);
                    current = parseEditedMessage(edited);
                    yield* Console.log("Message updated.");
                    yield* displayRaw(current);
                    continue;
                }

                if (action === "regenerate_with_feedback") {
                    const feedback = yield* Prompt.text({ message: "What should be different?" });
                    prompt = [{ role: "user", content: feedback }];
                } else {
                    prompt = [{ role: "user", content: "Please try a different commit message." }];
                }

                yield* Console.log("Generating commit message...");
                const response = yield* chat.generateObject({ objectName: "commit_message", prompt, schema: CommitMessage });
                current = { subject: response.value.subjectLine, body: response.value.body };
                yield* displayRaw(current);
            }
        }).pipe(
            Effect.provide(Layer.mergeAll(CommitAi.layer, Editor.layer, AnthropicLanguageModel.model(config.model))),
            Effect.catchTag("GitError", (error) => Console.error(error.message)),
            Effect.catchTag("CommitAiError", (error) => Console.error(`AI error: ${error.message}`)),
            Effect.catchTag("EditorError", (error) => Console.error(`Editor error: ${error.message}`)),
        ),
).pipe(Command.withDescription("Generate and create a conventional commit from staged changes"));
