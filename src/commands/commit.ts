import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Config, Console, Effect, Layer, Option } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";
import envPaths from "env-paths";

import { CommitMessage, GitContext } from "../domain/CommitMessage.ts";
import { ConfigSetupError, GitError } from "../domain/errors.ts";
import { parseBinaryFiles } from "../domain/parseBinaryFiles.ts";
import { parseEditedMessage } from "../domain/parseEditedMessage.ts";
import { parseStatus } from "../domain/parseStatus.ts";
import { CommitAi, DEFAULT_COMMIT_SYSTEM_PROMPT } from "../services/CommitAi.ts";
import { Editor } from "../services/Editor.ts";
import { Git } from "../services/Git.ts";
import { OgitConfigService } from "../services/OgitConfig.ts";

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

const displayRaw = Effect.fn("displayRaw")(function* (m: { subject: string; body: string }) {
    yield* Console.log("");
    yield* Console.log(m.subject);
    yield* Console.log("");
    yield* Console.log(m.body);
    yield* Console.log("");
});

const autoStage = Effect.fn("autoStage")(function* () {
    const git = yield* Git;
    const commitAi = yield* CommitAi;

    // 1. Get file list and branch
    const [status, branch] = yield* Effect.all([git.status(), git.branch()]);
    const files = parseStatus(status);

    if (files.length === 0) {
        return yield* new GitError({ reason: "nothing_staged", message: "No changes to commit." });
    }

    // 2. AI triage — classify files by name
    yield* Console.log("Analysing files...");
    const triage = yield* commitAi.triageFiles(files, branch);

    if (triage.analyse.length === 0) {
        return yield* new GitError({ reason: "nothing_staged", message: "No files suitable for committing." });
    }

    // 3. Filter out binary files
    yield* git.intentToAdd(triage.analyse);
    const numstatOutput = yield* git.numstat();
    yield* git.resetFiles(triage.analyse);

    const binaryFiles = parseBinaryFiles(numstatOutput);
    const textFiles = triage.analyse.filter((f: string) => !binaryFiles.includes(f));

    if (textFiles.length === 0) {
        return yield* new GitError({
            reason: "nothing_staged",
            message: "Only binary/output files found — nothing to analyse.",
        });
    }

    // 4. Get diffs for text files
    yield* git.intentToAdd(textFiles);
    const diff = yield* git.diffFiles(textFiles);
    yield* git.resetFiles(textFiles);

    // 5. AI analysis — group by relevance
    const analysis = yield* commitAi.analyseFiles(diff, branch);

    // 6. Stage based on analysis
    if (analysis.allRelevant) {
        yield* git.addFiles(textFiles);
    } else {
        // Show irrelevant files
        yield* Console.log("");
        yield* Console.log("These files seem unrelated to the main changes:");
        for (const file of analysis.irrelevant) {
            yield* Console.log(`  - ${file.path} (${file.reason})`);
        }
        yield* Console.log("");

        const exclude = yield* Prompt.confirm({ message: "Exclude them from this commit?" });

        if (exclude) {
            yield* git.addFiles(analysis.relevant);
        } else {
            yield* git.addFiles(textFiles);
        }
    }

    // Log skipped files if any
    if (triage.skip.length > 0) {
        yield* Console.log("");
        yield* Console.log("Skipped (output/generated files):");
        for (const file of triage.skip) {
            yield* Console.log(`  - ${file.path} (${file.reason})`);
        }
    }
});

export const commit = Command.make(
    "commit",
    {
        model: Flag.string("model").pipe(
            Flag.withAlias("m"),
            Flag.optional,
            Flag.withDescription("Anthropic model to use"),
        ),
        nonInteractive: Flag.boolean("non-interactive").pipe(
            Flag.withAlias("n"),
            Flag.withDefault(false),
            Flag.withDescription("Generate and commit without prompting"),
        ),
        showPrompt: Flag.boolean("show-prompt").pipe(
            Flag.withDefault(false),
            Flag.withDescription("Print the system prompt used for commit message generation and exit"),
        ),
    },
    (config) => {
        const ogitConfigLayer = OgitConfigService.layer(
            Option.match(config.model, { onNone: () => ({}), onSome: (model) => ({ model }) }),
        );

        if (config.showPrompt) {
            return Effect.gen(function* () {
                const ogitConfig = yield* OgitConfigService;

                yield* Console.log("Default system prompt:\n");
                yield* Console.log(DEFAULT_COMMIT_SYSTEM_PROMPT);

                if (Option.isSome(ogitConfig.commitSystemPrompt)) {
                    yield* Console.log("\nCustom system prompt (from config):\n");
                    yield* Console.log(ogitConfig.commitSystemPrompt.value);
                }
            }).pipe(
                Effect.provide(ogitConfigLayer),
                Effect.catchTag("ConfigError", () =>
                    Console.error("Configuration error. Check your ogit config files."),
                ),
            );
        }

        return Effect.gen(function* () {
            const ogitConfig = yield* OgitConfigService;
            const git = yield* Git;
            const commitAi = yield* CommitAi;
            const editor = yield* Editor;

            // 1. Check for staged changes
            const hasStagedChanges = yield* git.diffStaged().pipe(
                Effect.map(() => true),
                Effect.catchTag("GitError", (e) =>
                    e.reason === "nothing_staged" ? Effect.succeed(false) : Effect.fail(e),
                ),
            );

            if (!hasStagedChanges) {
                if (config.nonInteractive) {
                    yield* git.addAll();
                } else {
                    yield* autoStage();
                }
            }

            // 2. Gather context in parallel (now guaranteed to have staged changes)
            const [diff, branch, status, recentCommits] = yield* Effect.all([
                git.diffStaged(),
                git.branch(),
                git.status(),
                git.log(10),
            ]);

            const context = new GitContext({ diff, branch, status, recentCommits });

            // 3. Create chat session (with optional system prompt from config)
            const chat = yield* commitAi.createChat(context, Option.getOrUndefined(ogitConfig.commitSystemPrompt));

            // 4. Initial generation
            yield* Console.log("Generating commit message...");
            let prompt: Array<{ role: "user"; content: string }> = [];
            const initial = yield* chat.generateObject({ objectName: "commit_message", prompt, schema: CommitMessage });
            let current = { subject: initial.value.subjectLine, body: initial.value.body };
            yield* displayRaw(current);

            // Non-interactive: commit immediately and exit
            if (config.nonInteractive) {
                yield* git.commit(current.subject, current.body);
                yield* Console.log("Committed.");
                return;
            }

            // 5. Action loop
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
                    const next = parseEditedMessage(edited);
                    if (next.subject === current.subject && next.body === current.body) {
                        yield* Console.log("No changes made.");
                    } else {
                        current = next;
                        yield* Console.log("Message updated.");
                        yield* displayRaw(current);
                    }
                    continue;
                }

                if (action === "regenerate_with_feedback") {
                    const feedback = yield* Prompt.text({ message: "What should be different?" });
                    prompt = [{ role: "user", content: feedback }];
                } else {
                    prompt = [{ role: "user", content: "Please try a different commit message." }];
                }

                yield* Console.log("Generating commit message...");
                const response = yield* chat.generateObject({
                    objectName: "commit_message",
                    prompt,
                    schema: CommitMessage,
                });
                current = { subject: response.value.subjectLine, body: response.value.body };
                yield* displayRaw(current);
            }
        }).pipe(
            Effect.provide(
                Layer.mergeAll(
                    CommitAi.layer,
                    Editor.layer,
                    Layer.unwrap(
                        Effect.gen(function* () {
                            const ogitConfig = yield* OgitConfigService;
                            const model = Option.getOrElse(ogitConfig.model, () => "claude-haiku-4-5");
                            return AnthropicLanguageModel.model(model);
                        }),
                    ),
                ).pipe(
                    Layer.provide(
                        Layer.unwrap(
                            Effect.gen(function* () {
                                const ogitConfig = yield* OgitConfigService;
                                const envApiKey = yield* Config.option(Config.redacted("OGIT_API_KEY"));

                                const apiKey = Option.orElse(envApiKey, () => ogitConfig.apiKey);
                                if (Option.isNone(apiKey)) {
                                    return yield* new ConfigSetupError({
                                        reason: "missing_api_key",
                                        message: "No API key found",
                                        globalConfigPath: `${envPaths("ogit", { suffix: "" }).config}/config.kdl`,
                                    });
                                }

                                return AnthropicClient.layerConfig({ apiKey: Config.succeed(apiKey.value) });
                            }),
                        ),
                    ),
                    Layer.provideMerge(ogitConfigLayer),
                ),
            ),
            Effect.catchTag("GitError", (error) => Console.error(error.message)),
            Effect.catchTag("CommitAiError", (error) => Console.error(`AI error: ${error.message}`)),
            Effect.catchTag("EditorError", (error) => Console.error(`Editor error: ${error.message}`)),
            Effect.catchTag("ConfigSetupError", (error) => {
                if (error.reason === "missing_api_key") {
                    return Console.error(
                        "Missing API key. Set it using one of:\n" +
                            '  - Environment variable: export OGIT_API_KEY="your-key"\n' +
                            `  - Global config: add api-key "your-key" to ${error.globalConfigPath}\n` +
                            '  - Local config: add api-key "your-key" to .ogit.kdl in your repo',
                    );
                }
                return Console.error(`Configuration error: ${error.message}`);
            }),
        );
    },
).pipe(Command.withDescription("Generate and create a conventional commit from staged changes"));
