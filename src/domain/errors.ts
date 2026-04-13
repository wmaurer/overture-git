import { Schema } from "effect";

export class GitError extends Schema.TaggedErrorClass<GitError>()("GitError", {
    reason: Schema.Literals(["nothing_staged", "command_failed"]),
    message: Schema.String,
}) {}

export class CommitAiError extends Schema.TaggedErrorClass<CommitAiError>()("CommitAiError", {
    reason: Schema.Literals(["generation_failed", "invalid_response"]),
    message: Schema.String,
}) {}

export class EditorError extends Schema.TaggedErrorClass<EditorError>()("EditorError", {
    reason: Schema.Literals(["editor_failed"]),
    message: Schema.String,
}) {}

export class ConfigSetupError extends Schema.TaggedErrorClass<ConfigSetupError>()("ConfigSetupError", {
    reason: Schema.Literals(["missing_api_key"]),
    message: Schema.String,
    globalConfigPath: Schema.String,
}) {}
