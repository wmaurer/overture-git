import { Schema } from "effect";

export class BranchNameSuggestion extends Schema.Class<BranchNameSuggestion>("BranchNameSuggestion")({
    name: Schema.String,
    reasoning: Schema.String,
}) {}
