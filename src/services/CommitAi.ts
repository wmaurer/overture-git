import { Context, Effect, Layer } from "effect";
import { Chat, LanguageModel } from "effect/unstable/ai";

import { FileAnalysis, FileTriage } from "../domain/FileAnalysis.ts";
import { GitContext } from "../domain/CommitMessage.ts";
import { CommitAiError } from "../domain/errors.ts";

const buildSystemPrompt = (instructions?: string): string => {
    const customRule = instructions ? `\n- ${instructions}` : "";
    return `You are a git commit message generator. You analyze diffs and produce structured conventional commit messages.

Rules:${customRule}
- Use conventional commit format: type(scope): short description
- Subject must be imperative mood, max 72 characters, lowercase
- Bullets should summarize WHAT changed and WHY, not HOW
- Group related changes into concise bullet points
- Do NOT mention AI, Claude, or auto-generation
- Common types: feat, fix, refactor, chore, docs, test, perf, style
- Scope is optional — use it when changes are focused on one area`;
};

const buildUserPrompt = (
    context: GitContext,
): string => `Analyze the following git context and generate a commit message.

## Current Branch
${context.branch}

## Git Status
${context.status}

## Recent Commits (for style reference)
${context.recentCommits || "(no prior commits)"}

## Staged Diff
${context.diff}`;

const triageSystemPrompt = `You are a file triage assistant for git commits. Given a list of changed file paths, classify each as:
- "analyse": source code, config, or other files that should be reviewed for a commit
- "skip": output files, logs, generated artifacts, binaries, or files that should not be sent for further analysis

Examples of files to skip: log files, build output, manifests, coverage reports, lock files, compiled output, cache files.
When in doubt, include the file in "analyse".`;

const buildTriagePrompt = (files: ReadonlyArray<string>, branch: string): string =>
    `Classify these changed files on branch "${branch}":\n\n${files.map((f) => `- ${f}`).join("\n")}`;

const analysisSystemPrompt = `You are a git commit analyst. Given a diff of changed files, determine whether all changes belong in a single commit or if some are unrelated.

Rules:
- Group changes that form a single logical unit (e.g., a feature + its tests + its docs)
- Flag files that seem unrelated to the main body of changes
- When in doubt, consider files relevant
- A file is irrelevant only if it clearly serves a different purpose than the majority of changes`;

const buildAnalysisPrompt = (diff: string, branch: string): string =>
    `Analyse the following diff from branch "${branch}" and determine which files belong together in a single commit.\n\n## Diff\n${diff}`;

export class CommitAi extends Context.Service<
    CommitAi,
    {
        readonly createChat: (context: GitContext, instructions?: string) => Effect.Effect<Chat.Service, CommitAiError>;
        readonly triageFiles: (
            files: ReadonlyArray<string>,
            branch: string,
        ) => Effect.Effect<FileTriage, CommitAiError, LanguageModel.LanguageModel>;
        readonly analyseFiles: (
            diff: string,
            branch: string,
        ) => Effect.Effect<FileAnalysis, CommitAiError, LanguageModel.LanguageModel>;
    }
>()("@overture/CommitAi") {
    static layer = Layer.succeed(
        CommitAi,
        CommitAi.of({
            createChat: Effect.fn("CommitAi.createChat")(
                function* (context: GitContext, instructions?: string) {
                    return yield* Chat.fromPrompt([
                        { role: "system", content: buildSystemPrompt(instructions) },
                        { role: "user", content: buildUserPrompt(context) },
                    ]);
                },
                Effect.mapError(
                    (error) =>
                        new CommitAiError({
                            reason: "generation_failed",
                            message: String(error),
                        }),
                ),
            ),

            triageFiles: Effect.fn("CommitAi.triageFiles")(
                function* (files: ReadonlyArray<string>, branch: string) {
                    const chat = yield* Chat.fromPrompt([
                        { role: "system", content: triageSystemPrompt },
                        { role: "user", content: buildTriagePrompt(files, branch) },
                    ]);
                    const result = yield* chat.generateObject({ objectName: "file_triage", prompt: [], schema: FileTriage });
                    return result.value;
                },
                Effect.mapError(
                    (error) => new CommitAiError({ reason: "generation_failed", message: String(error) }),
                ),
            ),

            analyseFiles: Effect.fn("CommitAi.analyseFiles")(
                function* (diff: string, branch: string) {
                    const chat = yield* Chat.fromPrompt([
                        { role: "system", content: analysisSystemPrompt },
                        { role: "user", content: buildAnalysisPrompt(diff, branch) },
                    ]);
                    const result = yield* chat.generateObject({ objectName: "file_analysis", prompt: [], schema: FileAnalysis });
                    return result.value;
                },
                Effect.mapError(
                    (error) => new CommitAiError({ reason: "generation_failed", message: String(error) }),
                ),
            ),
        }),
    );
}
