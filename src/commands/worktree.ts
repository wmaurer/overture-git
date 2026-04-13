import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Config, Console, Effect, FileSystem, Layer, Option } from "effect";
import { Command, Prompt } from "effect/unstable/cli";
import envPaths from "env-paths";

import { ConfigSetupError, WorktreeError } from "../domain/errors.ts";
import { parseStatus } from "../domain/parseStatus.ts";
import { sanitizeBranchName } from "../domain/sanitizeBranchName.ts";
import { Git } from "../services/Git.ts";
import { OgitAi } from "../services/OgitAi.ts";
import { OgitConfigService } from "../services/OgitConfig.ts";

const ensureWorktreesDir = Effect.fn("ensureWorktreesDir")(function* (repoRoot: string) {
    const fs = yield* FileSystem.FileSystem;
    const worktreesDir = `${repoRoot}/.worktrees`;

    // Create .worktrees/ directory if it doesn't exist
    yield* fs.makeDirectory(worktreesDir).pipe(Effect.catchTag("PlatformError", () => Effect.void));

    // Ensure .worktrees is in .gitignore
    const gitignorePath = `${repoRoot}/.gitignore`;
    const content = yield* fs.readFileString(gitignorePath).pipe(Effect.orElseSucceed(() => ""));
    const lines = content.split("\n");
    const hasEntry = lines.some((line: string) => line.trim() === "/.worktrees" || line.trim() === ".worktrees");

    if (!hasEntry) {
        const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
        yield* fs.writeFileString(gitignorePath, `${content}${separator}/.worktrees\n`);
    }

    return worktreesDir;
});

const create = Command.make("create", {}, () =>
    Effect.gen(function* () {
        const git = yield* Git;
        const repoRoot = yield* git.repoRoot();
        const worktreesDir = yield* ensureWorktreesDir(repoRoot);

        // Check if working tree is clean
        const status = yield* git.status();
        const files = parseStatus(status);
        const isClean = files.length === 0;

        let branchName: string;

        if (isClean) {
            // Clean path: just ask for a branch name
            branchName = yield* Prompt.text({ message: "Branch name:" });
        } else {
            // Dirty path: capture diff, stash, suggest name

            // Capture untracked files for intent-to-add
            const untrackedFiles = status
                .split("\n")
                .filter((line) => line.startsWith("??"))
                .map((line) => line.slice(3));

            // Intent-to-add untracked files so they appear in diff
            if (untrackedFiles.length > 0) {
                yield* git.intentToAdd(untrackedFiles);
            }

            // Capture full diff (staged + unstaged + newly tracked)
            const diff = yield* git.diffAll();

            // Undo intent-to-add
            if (untrackedFiles.length > 0) {
                yield* git.resetFiles(untrackedFiles);
            }

            // Stash everything
            yield* git.stash().pipe(
                Effect.mapError(
                    () => new WorktreeError({ reason: "stash-failed", message: "Failed to stash changes." }),
                ),
            );

            // Get AI suggestion — if it fails, pop stash to restore changes
            const ogitAi = yield* OgitAi;
            const suggestion = yield* ogitAi.suggestBranchName(diff).pipe(
                Effect.catchTag("OgitAiError", (error) =>
                    Effect.gen(function* () {
                        yield* git.stashPopIn(repoRoot).pipe(Effect.ignore);
                        return yield* new WorktreeError({
                            reason: "ai-failed-changes-restored",
                            message: `AI suggestion failed: ${error.message}. Your changes have been restored.`,
                        });
                    }),
                ),
            );

            yield* Console.log(`\nSuggested: ${suggestion.name}`);
            yield* Console.log(`Reason: ${suggestion.reasoning}\n`);

            branchName = yield* Prompt.text({
                message: "Branch name:",
                default: suggestion.name,
            });
        }

        // Sanitize and create worktree
        const dirName = sanitizeBranchName(branchName);
        const worktreePath = `${worktreesDir}/${dirName}`;

        yield* git.worktreeAdd(worktreePath, branchName).pipe(
            Effect.mapError(
                () =>
                    new WorktreeError({
                        reason: "worktree-create-failed",
                        message: `Failed to create worktree at ${worktreePath}`,
                    }),
            ),
        );

        // If dirty, pop stash into the new worktree
        if (!isClean) {
            yield* git.stashPopIn(worktreePath).pipe(
                Effect.mapError(
                    () =>
                        new WorktreeError({
                            reason: "stash-pop-failed",
                            message: `Worktree created at ${worktreePath} but stash pop failed. Run 'git -C ${worktreePath} stash pop' manually to resolve.`,
                        }),
                ),
            );
        }

        yield* Console.log(`\nWorktree created at ${worktreePath} on branch ${branchName}`);
    }).pipe(
        Effect.provide(
            Layer.mergeAll(
                OgitAi.layer,
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
                Layer.provideMerge(OgitConfigService.layer({})),
            ),
        ),
        Effect.catchTag("WorktreeError", (error) => Console.error(error.message)),
        Effect.catchTag("GitError", (error) => Console.error(error.message)),
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
        Effect.catchTag("ConfigError", () =>
            Console.error("Configuration error. Check your ogit config files."),
        ),
        Effect.catchTag("PlatformError", (error) => Console.error(`File system error: ${error.message}`)),
    ),
).pipe(Command.withDescription("Create a new worktree with a branch"));

export const worktree = Command.make("worktree").pipe(
    Command.withDescription("Manage git worktrees"),
    Command.withSubcommands([create]),
);
