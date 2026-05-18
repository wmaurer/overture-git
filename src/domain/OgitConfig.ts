import { Schema } from "effect";

const CommitConfig = Schema.Struct({ "system-prompt": Schema.optionalKey(Schema.String) });

export const Provider = Schema.Literals(["anthropic", "claude-code"]);
export type Provider = typeof Provider.Type;

export class OgitConfig extends Schema.Class<OgitConfig>("OgitConfig")({
    "api-key": Schema.optionalKey(Schema.Redacted(Schema.String)),
    model: Schema.optionalKey(Schema.String),
    provider: Schema.optionalKey(Provider),
    commit: Schema.optionalKey(CommitConfig),
}) {}
