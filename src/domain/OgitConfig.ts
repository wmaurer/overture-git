import { Schema } from "effect";

const CommitConfigSchema = Schema.Struct({ "system-prompt": Schema.optionalKey(Schema.String) });

export const OgitConfigSchema = Schema.Struct({
    "api-key": Schema.optionalKey(Schema.Redacted(Schema.String)),
    model: Schema.optionalKey(Schema.String),
    commit: Schema.optionalKey(CommitConfigSchema),
});

export type OgitConfig = typeof OgitConfigSchema.Type;
