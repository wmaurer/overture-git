import { Config, Context, Effect, Layer, Option, Schema } from "effect";
import envPaths from "env-paths";
import * as fs from "node:fs";
import * as path from "node:path";

import { OgitConfigSchema, type OgitConfig as OgitConfigType } from "../domain/OgitConfig.ts";
import { parseKdlToObject } from "../domain/parseKdl.ts";
import { findConfigFile } from "../domain/findConfigFile.ts";
import { mergeConfigs } from "../domain/mergeConfigs.ts";

const GLOBAL_CONFIG_FILENAME = "config.kdl";

const readAndParseKdl = (filePath: string): OgitConfigType | undefined => {
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        const raw = parseKdlToObject(content);
        return Schema.decodeUnknownSync(OgitConfigSchema)(raw);
    } catch {
        return undefined;
    }
};

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
                // 1. Global config
                const globalDir = yield* Effect.sync(() => envPaths("ogit", { suffix: "" }).config);
                const globalConfig = readAndParseKdl(path.join(globalDir, GLOBAL_CONFIG_FILENAME)) ?? {};

                // 2. Per-repo config (walk up from cwd)
                const cwd = process.cwd();
                const localPath = findConfigFile(cwd);
                const localConfig = localPath ? (readAndParseKdl(localPath) ?? {}) : {};

                // 3. Env var overrides (api-key only)
                const envApiKey = yield* Config.option(Config.string("OGIT_API_KEY"));
                const envConfig: OgitConfigType = Option.isSome(envApiKey)
                    ? { "api-key": envApiKey.value }
                    : {};

                // 4. CLI flag overrides
                const cliConfig: OgitConfigType = overrides.model ? { model: overrides.model } : {};

                // 5. Merge: global < local < env < cli
                const merged = mergeConfigs(globalConfig, localConfig, envConfig, cliConfig);

                return OgitConfigService.of({
                    config: merged,
                    commitSystemPrompt: Option.fromNullishOr(merged.commit?.["system-prompt"]),
                    model: Option.fromNullishOr(merged.model),
                    apiKey: Option.fromNullishOr(merged["api-key"]),
                });
            }),
        );
}
