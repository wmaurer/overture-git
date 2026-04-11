#!/usr/bin/env node
import { NodeServices, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";

import { commit } from "./commands/commit.ts";
import { Git } from "./services/Git.ts";

const mainLayer = Git.layer.pipe(Layer.provideMerge(NodeServices.layer));

Command.make("ogit").pipe(
    Command.withDescription("Git workflow tools powered by AI"),
    Command.withSubcommands([commit]),
    Command.run({ version: "1.0.0" }),
    Effect.provide(mainLayer),
    NodeRuntime.runMain,
);
