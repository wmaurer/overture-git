import { Schema } from "effect";

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
