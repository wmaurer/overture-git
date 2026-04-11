import { Option, Schema } from "effect";

export class CommitMessage extends Schema.Class<CommitMessage>("CommitMessage")({
    type: Schema.Literals(["feat", "fix", "refactor", "chore", "docs", "test", "perf", "style"]),
    scope: Schema.OptionFromOptionalKey(Schema.String),
    subject: Schema.String,
    bullets: Schema.Array(Schema.String),
}) {
    get subjectLine(): string {
        const scopePart = Option.match(this.scope, {
            onNone: () => "",
            onSome: (s) => `(${s})`,
        });
        return `${this.type}${scopePart}: ${this.subject}`;
    }

    get body(): string {
        return this.bullets.map((b) => `- ${b}`).join("\n");
    }

    get fullMessage(): string {
        return `${this.subjectLine}\n\n${this.body}`;
    }
}

export class GitContext extends Schema.Class<GitContext>("GitContext")({
    diff: Schema.String,
    branch: Schema.String,
    recentCommits: Schema.String,
    status: Schema.String,
}) {}

export class FileTriage extends Schema.Class<FileTriage>("FileTriage")({
    analyse: Schema.Array(Schema.String),
    skip: Schema.Array(
        Schema.Struct({
            path: Schema.String,
            reason: Schema.String,
        }),
    ),
}) {}

export class FileAnalysis extends Schema.Class<FileAnalysis>("FileAnalysis")({
    allRelevant: Schema.Boolean,
    relevant: Schema.Array(Schema.String),
    irrelevant: Schema.Array(
        Schema.Struct({
            path: Schema.String,
            reason: Schema.String,
        }),
    ),
}) {}
