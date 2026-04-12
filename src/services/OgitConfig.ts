import { Config, Context, Effect, Layer, Option, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import envPaths from "env-paths";

import { OgitConfigSchema, type OgitConfig as OgitConfigType } from "../domain/OgitConfig.ts";
import { parseKdlToObject } from "../domain/parseKdl.ts";
import { findConfigFile } from "./findConfigFile.ts";
import { mergeConfigs } from "../domain/mergeConfigs.ts";

const GLOBAL_CONFIG_FILENAME = "config.kdl";

const readAndParseKdl = Effect.fn("readAndParseKdl")(
    function* (filePath: string) {
        const fs = yield* FileSystem.FileSystem;
        const content = yield* fs.readFileString(filePath);
        const raw = parseKdlToObject(content);
        return Schema.decodeUnknownSync(OgitConfigSchema)(raw);
    },
    Effect.option,
);

export class OgitConfigService extends Context.Service<
    OgitConfigService,
    {
        readonly config: OgitConfigType;
        readonly commitSystemPrompt: Option.Option<string>;
        readonly model: Option.Option<string>;
        readonly apiKey: Option.Option<string>;
    }
>()("@ogit/Config") {
    static layer = (overrides: { model?: string }) =>
        Layer.effect(
            OgitConfigService,
            Effect.gen(function* () {
                const path = yield* Path.Path;

                // 1. Global config
                const globalDir = envPaths("ogit", { suffix: "" }).config;
                const globalConfig = yield* readAndParseKdl(path.join(globalDir, GLOBAL_CONFIG_FILENAME));

                // 2. Per-repo config (walk up from cwd)
                const cwd = path.resolve();
                const localPath = yield* findConfigFile(cwd);
                const localConfig = Option.isSome(localPath) ? yield* readAndParseKdl(localPath.value) : Option.none<OgitConfigType>();

                // 3. Env var overrides (api-key only)
                const envApiKey = yield* Config.option(Config.string("OGIT_API_KEY"));
                const envConfig: OgitConfigType = Option.isSome(envApiKey)
                    ? { "api-key": envApiKey.value }
                    : {};

                // 4. CLI flag overrides
                const cliConfig: OgitConfigType = overrides.model ? { model: overrides.model } : {};

                // 5. Merge: global < local < env < cli
                const merged = mergeConfigs(
                    Option.getOrElse(globalConfig, () => ({}) as OgitConfigType),
                    Option.getOrElse(localConfig, () => ({}) as OgitConfigType),
                    envConfig,
                    cliConfig,
                );

                return OgitConfigService.of({
                    config: merged,
                    commitSystemPrompt: Option.fromNullishOr(merged.commit?.["system-prompt"]),
                    model: Option.fromNullishOr(merged.model),
                    apiKey: Option.fromNullishOr(merged["api-key"]),
                });
            }),
        );
}
