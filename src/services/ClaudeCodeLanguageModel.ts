import { query, type Options as QueryOptions, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { Effect, Layer, Stream } from "effect";
import * as AiError from "effect/unstable/ai/AiError";
import { toCodecAnthropic } from "effect/unstable/ai/AnthropicStructuredOutput";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as Tool from "effect/unstable/ai/Tool";

import type * as Prompt from "effect/unstable/ai/Prompt";
import type * as Response from "effect/unstable/ai/Response";

type Turn = { readonly role: "user" | "assistant"; readonly text: string };

const extractText = (parts: ReadonlyArray<{ readonly type: string }>): string =>
    parts
        .filter((p): p is { readonly type: "text"; readonly text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");

const flattenPrompt = (prompt: Prompt.Prompt): { readonly system: string | undefined; readonly user: string } => {
    const systemParts: Array<string> = [];
    const turns: Array<Turn> = [];

    for (const msg of prompt.content) {
        if (msg.role === "system") {
            systemParts.push(msg.content);
        } else if (msg.role === "user") {
            turns.push({ role: "user", text: extractText(msg.content) });
        } else if (msg.role === "assistant") {
            turns.push({ role: "assistant", text: extractText(msg.content) });
        }
    }

    const system = systemParts.length > 0 ? systemParts.join("\n\n") : undefined;

    // Single user turn — pass through verbatim
    if (turns.length === 1 && turns[0].role === "user") {
        return { system, user: turns[0].text };
    }

    // Multi-turn — flatten as transcript so the SDK sees prior assistant context
    const transcript = turns
        .map((t) => (t.role === "user" ? `USER:\n${t.text}` : `ASSISTANT:\n${t.text}`))
        .join("\n\n---\n\n");

    return { system, user: transcript };
};

const aiError = (method: string, description: string): AiError.AiError =>
    AiError.make({ module: "ClaudeCodeLanguageModel", method, reason: new AiError.UnknownError({ description }) });

const runQuery = (params: { readonly user: string; readonly options: QueryOptions; readonly method: string }) =>
    Effect.tryPromise({
        try: async (): Promise<SDKResultMessage> => {
            for await (const msg of query({ prompt: params.user, options: params.options })) {
                if (msg.type === "result") {
                    return msg;
                }
            }
            throw new Error("Claude Code SDK terminated without a result message");
        },
        catch: (cause) => aiError(params.method, cause instanceof Error ? cause.message : String(cause)),
    });

const generate = (
    config: { readonly model: string },
    options: LanguageModel.ProviderOptions,
): Effect.Effect<Array<Response.PartEncoded>, AiError.AiError> =>
    Effect.gen(function* () {
        const { system, user } = flattenPrompt(options.prompt);

        const baseOptions: QueryOptions = {
            model: config.model,
            maxTurns: 1,
            tools: [],
            allowDangerouslySkipPermissions: true,
            permissionMode: "bypassPermissions",
            ...(system !== undefined ? { systemPrompt: system } : {}),
        };

        const responseFormat = options.responseFormat;
        if (responseFormat.type === "json") {
            const jsonSchema = yield* Effect.try({
                try: () => Tool.getJsonSchemaFromSchema(responseFormat.schema, { transformer: toCodecAnthropic }),
                catch: (cause) =>
                    AiError.make({
                        module: "ClaudeCodeLanguageModel",
                        method: "generate",
                        reason: new AiError.UnsupportedSchemaError({
                            description: cause instanceof Error ? cause.message : String(cause),
                        }),
                    }),
            });

            const result = yield* runQuery({
                user,
                options: {
                    ...baseOptions,
                    outputFormat: { type: "json_schema", schema: jsonSchema as Record<string, unknown> },
                },
                method: "generate",
            });

            if (result.subtype !== "success") {
                return yield* aiError("generate", `Claude Code SDK returned ${result.subtype}`);
            }

            if (result.structured_output === undefined) {
                return yield* aiError(
                    "generate",
                    "Claude Code SDK did not return structured_output for json response format",
                );
            }

            const parts: Array<Response.PartEncoded> = [
                { type: "text", text: JSON.stringify(result.structured_output) },
            ];
            return parts;
        }

        const result = yield* runQuery({ user, options: baseOptions, method: "generate" });

        if (result.subtype !== "success") {
            return yield* aiError("generate", `Claude Code SDK returned ${result.subtype}`);
        }

        const parts: Array<Response.PartEncoded> = [{ type: "text", text: result.result }];
        return parts;
    });

const make = (config: { readonly model: string }) =>
    LanguageModel.make({
        codecTransformer: toCodecAnthropic,
        generateText: (options) => generate(config, options),
        streamText: (options) =>
            Stream.unwrap(
                Effect.map(generate(config, options), (parts): Stream.Stream<Response.StreamPartEncoded> => {
                    const text = parts.find((p): p is Response.TextPartEncoded => p.type === "text")?.text ?? "";
                    const streamParts: Array<Response.StreamPartEncoded> = [
                        { type: "text-start", id: "0" },
                        { type: "text-delta", id: "0", delta: text },
                        { type: "text-end", id: "0" },
                    ];
                    return Stream.fromIterable(streamParts);
                }),
            ),
    });

export const ClaudeCodeLanguageModel = {
    layer: (options: { readonly model: string }): Layer.Layer<LanguageModel.LanguageModel> =>
        Layer.effect(LanguageModel.LanguageModel, make(options)),

    model: (modelId: string): Layer.Layer<LanguageModel.LanguageModel> =>
        Layer.effect(LanguageModel.LanguageModel, make({ model: modelId })),
};
