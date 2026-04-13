#!/usr/bin/env node
import { NodeServices, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";
import { FetchHttpClient } from "effect/unstable/http";
import { createRequire } from "node:module";

import { commit } from "./commands/commit.ts";
import { worktree } from "./commands/worktree.ts";
import { Git } from "./services/Git.ts";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const mainLayer = Git.layer.pipe(Layer.provideMerge(FetchHttpClient.layer), Layer.provideMerge(NodeServices.layer));

Command.make("ogit").pipe(
    Command.withDescription("Git workflow tools powered by AI"),
    Command.withSubcommands([commit, worktree]),
    Command.run({ version }),
    Effect.provide(mainLayer),
    NodeRuntime.runMain,
);
