import { Context, Duration, Effect, Layer } from "effect";
import { AiError, Chat, LanguageModel } from "effect/unstable/ai";

import { GitContext } from "../domain/CommitMessage.ts";
import { OgitAiError } from "../domain/errors.ts";
import { FileAnalysis, FileTriage } from "../domain/FileAnalysis.ts";

const countdown = (seconds: number): Effect.Effect<void> =>
    Effect.gen(function* () {
        for (let s = seconds; s > 0; s--) {
            yield* Effect.sync(() => process.stdout.write(`\rRate limited. Retrying in ${s}s...`));
            yield* Effect.sleep(Duration.seconds(1));
        }
        yield* Effect.sync(() => process.stdout.write("\r\x1b[K"));
    });

export const retryOnRateLimit = <A, E, R>(self: Effect.Effect<A, E, R>, retriesLeft = 3): Effect.Effect<A, E, R> =>
    Effect.catchIf(
        self,
        (error) => retriesLeft > 0 && AiError.isAiError(error) && error.reason._tag === "RateLimitError",
        (error) => {
            const aiError = error as unknown as AiError.AiError;
            const seconds = Math.ceil(Duration.toSeconds(aiError.retryAfter ?? Duration.seconds(30)));
            return countdown(seconds).pipe(Effect.andThen(retryOnRateLimit(self, retriesLeft - 1)));
        },
    ) as Effect.Effect<A, E, R>;

export const DEFAULT_COMMIT_SYSTEM_PROMPT = `You are a git commit message generator. You analyze diffs and produce conventional commit messages.

Write the commit message in English. Use correct capitalization.

Output format — respond with ONLY the commit message, nothing else:
- Line 1: the subject (conventional commit format)
- Line 2: blank
- Remaining lines: the body (bullet points)
No preamble, no closing remarks, no code fences, no labels like "Subject:" or "Body:".

Rules:
- Use conventional commit format: type(scope): short description
- Subject must be imperative mood, max 72 characters, lowercase
- Bullets should summarize WHAT changed and WHY, not HOW
- Group related changes into concise bullet points
- Do NOT mention AI, Claude, or auto-generation
- Common types: feat, fix, refactor, chore, docs, test, perf, style
- Scope is optional — use it when changes are focused on one area`;

const buildCommitUserPrompt = (
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

const branchNameSystemPrompt = `You are a branch name assistant. Given a git diff, suggest a single conventional branch name.

Format: <type>/<short-description>
- type: one of feat, fix, refactor, chore, docs, test, perf, style
- short-description: concise, kebab-case, max 4 words

Rules:
- Analyse the overall intent of the changes, not individual files
- Pick the most prominent change type
- The description should capture WHAT is being done, not HOW
- Documentation files (.md, .mdx) are often supplementary to code changes — if code changes are present, base the branch name on the code, not the docs
- Return exactly one suggestion`;

const isDocFile = (filePath: string): boolean => /\.(md|mdx)$/i.test(filePath);

const summarizeDiffForBranchName = (diff: string): string => {
    const fileDiffs = diff.split(/(?=^diff --git )/m);
    const codeDiffs: Array<string> = [];
    const docFiles: Array<string> = [];

    for (const section of fileDiffs) {
        if (!section.trim()) continue;
        const match = section.match(/^diff --git a\/(.+?) b\//);
        if (match && isDocFile(match[1])) {
            docFiles.push(match[1]);
        } else {
            codeDiffs.push(section);
        }
    }

    // If all changes are docs, return the original diff so the AI can still name it properly
    if (codeDiffs.length === 0) return diff;

    let result = codeDiffs.join("");
    if (docFiles.length > 0) {
        result += `\n\n## Documentation files also changed (content omitted)\n${docFiles.map((f) => `- ${f}`).join("\n")}`;
    }
    return result;
};

const buildBranchNamePrompt = (diff: string): string =>
    `Suggest a branch name for the following changes:\n\n## Diff\n${summarizeDiffForBranchName(diff)}`;

export class OgitAi extends Context.Service<
    OgitAi,
    {
        readonly createChat: (context: GitContext, systemPrompt?: string) => Effect.Effect<Chat.Service, OgitAiError>;
        readonly triageFiles: (
            files: ReadonlyArray<string>,
            branch: string,
        ) => Effect.Effect<FileTriage, OgitAiError, LanguageModel.LanguageModel>;
        readonly analyseFiles: (
            diff: string,
            branch: string,
        ) => Effect.Effect<FileAnalysis, OgitAiError, LanguageModel.LanguageModel>;
        readonly createBranchNameChat: (
            diff: string,
        ) => Effect.Effect<Chat.Service, OgitAiError, LanguageModel.LanguageModel>;
    }
>()("@overture/OgitAi") {
    static layer = Layer.succeed(
        OgitAi,
        OgitAi.of({
            createChat: Effect.fn("OgitAi.createChat")(
                function* (context: GitContext, systemPrompt?: string) {
                    return yield* Chat.fromPrompt([
                        { role: "system", content: systemPrompt ?? DEFAULT_COMMIT_SYSTEM_PROMPT },
                        { role: "user", content: buildCommitUserPrompt(context) },
                    ]);
                },
                Effect.mapError((error) => new OgitAiError({ reason: "generation_failed", message: String(error) })),
            ),

            triageFiles: Effect.fn("OgitAi.triageFiles")(
                function* (files: ReadonlyArray<string>, branch: string) {
                    const chat = yield* Chat.fromPrompt([
                        { role: "system", content: triageSystemPrompt },
                        { role: "user", content: buildTriagePrompt(files, branch) },
                    ]);
                    const result = yield* retryOnRateLimit(
                        chat.generateObject({ objectName: "file_triage", prompt: [], schema: FileTriage }),
                    );
                    return result.value;
                },
                Effect.mapError((error) => new OgitAiError({ reason: "generation_failed", message: String(error) })),
            ),

            analyseFiles: Effect.fn("OgitAi.analyseFiles")(
                function* (diff: string, branch: string) {
                    const chat = yield* Chat.fromPrompt([
                        { role: "system", content: analysisSystemPrompt },
                        { role: "user", content: buildAnalysisPrompt(diff, branch) },
                    ]);
                    const result = yield* retryOnRateLimit(
                        chat.generateObject({ objectName: "file_analysis", prompt: [], schema: FileAnalysis }),
                    );
                    return result.value;
                },
                Effect.mapError((error) => new OgitAiError({ reason: "generation_failed", message: String(error) })),
            ),

            createBranchNameChat: Effect.fn("OgitAi.createBranchNameChat")(
                function* (diff: string) {
                    return yield* Chat.fromPrompt([
                        { role: "system", content: branchNameSystemPrompt },
                        { role: "user", content: buildBranchNamePrompt(diff) },
                    ]);
                },
                Effect.mapError((error) => new OgitAiError({ reason: "generation_failed", message: String(error) })),
            ),
        }),
    );
}
