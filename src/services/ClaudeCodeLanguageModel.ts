import { query, type Options as QueryOptions } from "@anthropic-ai/claude-agent-sdk";
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
    Effect.gen(function* () {
        const iter = query({ prompt: params.user, options: params.options });
        let turn = 0;

        while (true) {
            const next = yield* Effect.tryPromise({
                try: () => iter.next(),
                catch: (cause) => aiError(params.method, cause instanceof Error ? cause.message : String(cause)),
            });

            if (next.done) {
                return yield* aiError(params.method, "Claude Code SDK terminated without a result message");
            }

            const msg = next.value;

            if (msg.type === "assistant") {
                turn++;
                yield* Effect.logDebug("claude-code SDK turn", { method: params.method, turn });
            }

            if (msg.type === "result") {
                yield* Effect.logDebug("claude-code SDK result", {
                    method: params.method,
                    numTurns: msg.num_turns,
                    subtype: msg.subtype,
                });
                return msg;
            }
        }
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
                    maxTurns: 5,
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

const streamGenerate = (
    config: { readonly model: string },
    options: LanguageModel.ProviderOptions,
): Stream.Stream<Response.StreamPartEncoded, AiError.AiError> => {
    // Structured output is only delivered on the SDK's final `result` message —
    // there's no token-level stream for it. Wait for the result and emit as one delta.
    if (options.responseFormat.type === "json") {
        return Stream.unwrap(
            Effect.map(generate(config, options), (parts) => {
                const text = parts.find((p): p is Response.TextPartEncoded => p.type === "text")?.text ?? "";
                return Stream.fromIterable<Response.StreamPartEncoded>([
                    { type: "text-start", id: "0" },
                    { type: "text-delta", id: "0", delta: text },
                    { type: "text-end", id: "0" },
                ]);
            }),
        );
    }

    const { system, user } = flattenPrompt(options.prompt);

    const sdkOptions: QueryOptions = {
        model: config.model,
        maxTurns: 1,
        tools: [],
        allowDangerouslySkipPermissions: true,
        permissionMode: "bypassPermissions",
        includePartialMessages: true,
        ...(system !== undefined ? { systemPrompt: system } : {}),
    };

    const textBlocks = new Set<number>();

    return Stream.fromAsyncIterable(query({ prompt: user, options: sdkOptions }), (cause) =>
        aiError("streamText", cause instanceof Error ? cause.message : String(cause)),
    ).pipe(
        Stream.flatMap((msg): Stream.Stream<Response.StreamPartEncoded, AiError.AiError> => {
            if (msg.type === "result" && msg.subtype !== "success") {
                return Stream.fail(aiError("streamText", `Claude Code SDK returned ${msg.subtype}`));
            }
            if (msg.type !== "stream_event") return Stream.empty;

            const event = msg.event;
            if (event.type === "content_block_start" && event.content_block.type === "text") {
                textBlocks.add(event.index);
                return Stream.succeed<Response.StreamPartEncoded>({ type: "text-start", id: String(event.index) });
            }
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                return Stream.succeed<Response.StreamPartEncoded>({
                    type: "text-delta",
                    id: String(event.index),
                    delta: event.delta.text,
                });
            }
            if (event.type === "content_block_stop" && textBlocks.delete(event.index)) {
                return Stream.succeed<Response.StreamPartEncoded>({ type: "text-end", id: String(event.index) });
            }
            return Stream.empty;
        }),
    );
};

const make = (config: { readonly model: string }) =>
    LanguageModel.make({
        codecTransformer: toCodecAnthropic,
        generateText: (options) => generate(config, options),
        streamText: (options) => streamGenerate(config, options),
    });

export const ClaudeCodeLanguageModel = {
    layer: (options: { readonly model: string }): Layer.Layer<LanguageModel.LanguageModel> =>
        Layer.effect(LanguageModel.LanguageModel, make(options)),

    model: (modelId: string): Layer.Layer<LanguageModel.LanguageModel> =>
        Layer.effect(LanguageModel.LanguageModel, make({ model: modelId })),
};
