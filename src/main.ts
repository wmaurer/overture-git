import { Config, Effect, Layer } from "effect"
import { Command } from "effect/unstable/cli"
import { FetchHttpClient } from "effect/unstable/http"
import { AnthropicClient } from "@effect/ai-anthropic"
import { NodeServices, NodeRuntime } from "@effect/platform-node"
import { commit } from "./commands/commit.ts"
import { Git } from "./services/Git.ts"

const mainLayer = Layer.mergeAll(
    Git.layer,
    AnthropicClient.layerConfig({
        apiKey: Config.redacted("ANTHROPIC_API_KEY"),
    }).pipe(Layer.provide(FetchHttpClient.layer)),
).pipe(Layer.provideMerge(NodeServices.layer))

Command.make("overture").pipe(
    Command.withDescription("Git workflow tools powered by AI"),
    Command.withSubcommands([commit]),
    Command.run({ version: "1.0.0" }),
    Effect.provide(mainLayer),
    NodeRuntime.runMain,
)
