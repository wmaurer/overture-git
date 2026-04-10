import { Schema } from "effect"

export class GitError extends Schema.TaggedErrorClass<GitError>()("GitError", {
    reason: Schema.Literals(["nothing_staged", "command_failed"]),
    message: Schema.String,
}) {}

export class CommitAiError extends Schema.TaggedErrorClass<CommitAiError>()("CommitAiError", {
    reason: Schema.Literals(["generation_failed", "invalid_response"]),
    message: Schema.String,
}) {}
