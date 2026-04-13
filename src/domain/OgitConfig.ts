import { Schema } from "effect";

const CommitConfig = Schema.Struct({ "system-prompt": Schema.optionalKey(Schema.String) });

export class OgitConfig extends Schema.Class<OgitConfig>("OgitConfig")({
    "api-key": Schema.optionalKey(Schema.Redacted(Schema.String)),
    model: Schema.optionalKey(Schema.String),
    commit: Schema.optionalKey(CommitConfig),
}) {}
