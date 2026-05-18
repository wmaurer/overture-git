import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Config, Effect, Layer, Option } from "effect";
import envPaths from "env-paths";

import { ConfigSetupError } from "../domain/errors.ts";
import { ClaudeCodeLanguageModel } from "./ClaudeCodeLanguageModel.ts";
import { OgitConfigService } from "./OgitConfig.ts";

const DEFAULT_MODEL = "claude-haiku-4-5";

const missingApiKey = (): ConfigSetupError =>
    new ConfigSetupError({
        reason: "missing_api_key",
        message: "No API key found",
        globalConfigPath: `${envPaths("ogit", { suffix: "" }).config}/config.kdl`,
    });

export const languageModelLayer = Layer.unwrap(
    Effect.gen(function* () {
        const ogitConfig = yield* OgitConfigService;
        const model = Option.getOrElse(ogitConfig.model, () => DEFAULT_MODEL);

        if (ogitConfig.provider === "claude-code") {
            return ClaudeCodeLanguageModel.model(model);
        }

        const envApiKey = yield* Config.option(Config.redacted("OGIT_API_KEY"));
        const apiKey = Option.orElse(envApiKey, () => ogitConfig.apiKey);
        if (Option.isNone(apiKey)) {
            return yield* missingApiKey();
        }

        return AnthropicLanguageModel.model(model).pipe(
            Layer.provide(AnthropicClient.layerConfig({ apiKey: Config.succeed(apiKey.value) })),
        );
    }),
);
