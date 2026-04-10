import { Effect } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { CommitAiError } from "../domain/errors.ts"
import { CommitMessage, GitContext } from "../domain/CommitMessage.ts"

const systemPrompt = `You are a git commit message generator. You analyze diffs and produce structured conventional commit messages.

Rules:
- Use conventional commit format: type(scope): short description
- Subject must be imperative mood, max 72 characters, lowercase
- Bullets should summarize WHAT changed and WHY, not HOW
- Group related changes into concise bullet points
- Do NOT mention AI, Claude, or auto-generation
- Common types: feat, fix, refactor, chore, docs, test, perf, style
- Scope is optional — use it when changes are focused on one area`

const buildUserPrompt = (context: GitContext): string => `Analyze the following git context and generate a commit message.

## Current Branch
${context.branch}

## Git Status
${context.status}

## Recent Commits (for style reference)
${context.recentCommits || "(no prior commits)"}

## Staged Diff
${context.diff}`

export const generate = Effect.fn("CommitAi.generate")(
    function* (context: GitContext) {
        const model = yield* LanguageModel.LanguageModel
        const response = yield* model.generateObject({
            objectName: "commit_message",
            prompt: [
                { role: "system" as const, content: systemPrompt },
                { role: "user" as const, content: buildUserPrompt(context) },
            ],
            schema: CommitMessage,
        })
        return response.value
    },
    Effect.mapError(
        (error) =>
            new CommitAiError({
                reason: "generation_failed",
                message: String(error),
            }),
    ),
)
