# KDL Config File Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace environment-variable-based configuration with a layered KDL config file system.

**Architecture:** New `OgitConfig` Effect Service reads config from up to 3 sources (global KDL, nearest per-repo KDL, env vars) and merges them with a clear priority order. A small KDL-to-plain-object transformer bridges `@bgotink/kdl` into Effect Schema. The commit command consumes `OgitConfig` instead of reading `OGIT_INSTRUCTIONS` directly.

**Tech Stack:** Effect v4, `@bgotink/kdl` (KDL parser), `env-paths` (cross-platform paths), vitest

**Design doc:** `docs/plans/2026-04-12-kdl-config-design.md`

---

### Task 1: Install dependencies

**Files:**

- Modify: `package.json`

**Step 1: Install @bgotink/kdl and env-paths**

Run:

```bash
pnpm add @bgotink/kdl env-paths
```

**Step 2: Verify installation**

Run: `pnpm exec tsc --noEmit`
Expected: No errors (dependencies resolve correctly)

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
ogit commit -n
```

---

### Task 2: KDL-to-plain-object transformer + tests

**Files:**

- Create: `src/domain/parseKdl.ts`
- Create: `test/domain/parseKdl.test.ts`

**Step 1: Write the failing tests**

Create `test/domain/parseKdl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseKdlToObject } from "../../src/domain/parseKdl.ts";

describe("parseKdlToObject", () => {
    it("parses top-level string arguments", () => {
        const result = parseKdlToObject(`model "claude-sonnet-4-20250514"`);
        expect(result).toEqual({ model: "claude-sonnet-4-20250514" });
    });

    it("parses multiple top-level nodes", () => {
        const result = parseKdlToObject(`
            api-key "sk-ant-123"
            model "claude-haiku-4-5"
        `);
        expect(result).toEqual({ "api-key": "sk-ant-123", model: "claude-haiku-4-5" });
    });

    it("parses nested children as objects", () => {
        const result = parseKdlToObject(`
            commit {
                system-prompt "You are a helper."
            }
        `);
        expect(result).toEqual({ commit: { "system-prompt": "You are a helper." } });
    });

    it("parses multi-line strings", () => {
        const result = parseKdlToObject(`
            commit {
                system-prompt """
                    Line one.
                    Line two.
                    """
            }
        `);
        expect(result).toEqual({ commit: { "system-prompt": "Line one.\nLine two." } });
    });

    it("parses boolean and number values", () => {
        const result = parseKdlToObject(`
            debug #true
            max-retries 3
        `);
        expect(result).toEqual({ debug: true, "max-retries": 3 });
    });

    it("returns empty object for empty document", () => {
        const result = parseKdlToObject("");
        expect(result).toEqual({});
    });

    it("throws on invalid KDL", () => {
        expect(() => parseKdlToObject("{{{")).toThrow();
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/domain/parseKdl.test.ts`
Expected: FAIL — module not found

**Step 3: Implement parseKdlToObject**

Create `src/domain/parseKdl.ts`:

```ts
import { parse } from "@bgotink/kdl";
import type { Document, Node } from "@bgotink/kdl/model";

const nodeToValue = (node: Node): unknown => {
    if (node.hasChildren()) {
        return documentToObject(node.children!);
    }
    return node.getArgument(0) ?? null;
};

const documentToObject = (doc: Document): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const node of doc.nodes) {
        result[node.getName()] = nodeToValue(node);
    }
    return result;
};

export const parseKdlToObject = (text: string): Record<string, unknown> => {
    const doc = parse(text);
    return documentToObject(doc);
};
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/domain/parseKdl.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add src/domain/parseKdl.ts test/domain/parseKdl.test.ts
ogit commit -n
```

---

### Task 3: Config schema + tests

**Files:**

- Create: `src/domain/OgitConfig.ts`
- Create: `test/domain/OgitConfig.test.ts`

**Step 1: Write the failing tests**

Create `test/domain/OgitConfig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Effect, Schema } from "effect";
import { OgitConfigSchema, type OgitConfig } from "../../src/domain/OgitConfig.ts";

const decode = (input: unknown): OgitConfig => Schema.decodeUnknownSync(OgitConfigSchema)(input);

describe("OgitConfigSchema", () => {
    it("decodes a full config", () => {
        const result = decode({
            "api-key": "sk-ant-123",
            model: "claude-sonnet-4-20250514",
            commit: { "system-prompt": "You are a helper." },
        });
        expect(result["api-key"]).toBe("sk-ant-123");
        expect(result.model).toBe("claude-sonnet-4-20250514");
        expect(result.commit?.["system-prompt"]).toBe("You are a helper.");
    });

    it("decodes an empty config (all optional)", () => {
        const result = decode({});
        expect(result["api-key"]).toBeUndefined();
        expect(result.model).toBeUndefined();
        expect(result.commit).toBeUndefined();
    });

    it("rejects invalid types", () => {
        expect(() => decode({ model: 123 })).toThrow();
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/domain/OgitConfig.test.ts`
Expected: FAIL — module not found

**Step 3: Implement OgitConfigSchema**

Create `src/domain/OgitConfig.ts`:

```ts
import { Schema } from "effect";

const CommitConfigSchema = Schema.Struct({ "system-prompt": Schema.optionalKey(Schema.String) });

export const OgitConfigSchema = Schema.Struct({
    "api-key": Schema.optionalKey(Schema.String),
    model: Schema.optionalKey(Schema.String),
    commit: Schema.optionalKey(CommitConfigSchema),
});

export type OgitConfig = typeof OgitConfigSchema.Type;
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/domain/OgitConfig.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/domain/OgitConfig.ts test/domain/OgitConfig.test.ts
ogit commit -n
```

---

### Task 4: Config file discovery (walk-up search) + tests

**Files:**

- Create: `src/domain/findConfigFile.ts`
- Create: `test/domain/findConfigFile.test.ts`

**Step 1: Write the failing tests**

Create `test/domain/findConfigFile.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { findConfigFile } from "../../src/domain/findConfigFile.ts";

describe("findConfigFile", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ogit-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("finds .ogit.kdl in the current directory", () => {
        const configPath = path.join(tmpDir, ".ogit.kdl");
        fs.writeFileSync(configPath, `model "test"`);

        expect(findConfigFile(tmpDir)).toBe(configPath);
    });

    it("finds .ogit.kdl in a parent directory", () => {
        const configPath = path.join(tmpDir, ".ogit.kdl");
        fs.writeFileSync(configPath, `model "test"`);

        const subDir = path.join(tmpDir, "sub", "deep");
        fs.mkdirSync(subDir, { recursive: true });

        expect(findConfigFile(subDir)).toBe(configPath);
    });

    it("returns undefined when no config exists", () => {
        expect(findConfigFile(tmpDir)).toBeUndefined();
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/domain/findConfigFile.test.ts`
Expected: FAIL — module not found

**Step 3: Implement findConfigFile**

Create `src/domain/findConfigFile.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";

const CONFIG_FILENAME = ".ogit.kdl";

export const findConfigFile = (startDir: string): string | undefined => {
    let dir = path.resolve(startDir);
    while (true) {
        const candidate = path.join(dir, CONFIG_FILENAME);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        const parent = path.dirname(dir);
        if (parent === dir) return undefined;
        dir = parent;
    }
};
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/domain/findConfigFile.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/domain/findConfigFile.ts test/domain/findConfigFile.test.ts
ogit commit -n
```

---

### Task 5: Config merge utility + tests

**Files:**

- Create: `src/domain/mergeConfigs.ts`
- Create: `test/domain/mergeConfigs.test.ts`

**Step 1: Write the failing tests**

Create `test/domain/mergeConfigs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeConfigs } from "../../src/domain/mergeConfigs.ts";
import type { OgitConfig } from "../../src/domain/OgitConfig.ts";

describe("mergeConfigs", () => {
    it("later configs override earlier ones", () => {
        const global: OgitConfig = { model: "claude-haiku-4-5" };
        const local: OgitConfig = { model: "claude-sonnet-4-20250514" };
        const result = mergeConfigs(global, local);
        expect(result.model).toBe("claude-sonnet-4-20250514");
    });

    it("preserves values not overridden", () => {
        const global: OgitConfig = { "api-key": "sk-123", model: "claude-haiku-4-5" };
        const local: OgitConfig = { model: "claude-sonnet-4-20250514" };
        const result = mergeConfigs(global, local);
        expect(result["api-key"]).toBe("sk-123");
        expect(result.model).toBe("claude-sonnet-4-20250514");
    });

    it("deep merges nested commit config", () => {
        const global: OgitConfig = { commit: { "system-prompt": "global prompt" } };
        const local: OgitConfig = { commit: { "system-prompt": "local prompt" } };
        const result = mergeConfigs(global, local);
        expect(result.commit?.["system-prompt"]).toBe("local prompt");
    });

    it("handles empty configs", () => {
        const result = mergeConfigs({}, {});
        expect(result).toEqual({});
    });

    it("merges three configs in order", () => {
        const a: OgitConfig = { model: "a" };
        const b: OgitConfig = { model: "b" };
        const c: OgitConfig = { model: "c" };
        const result = mergeConfigs(a, b, c);
        expect(result.model).toBe("c");
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/domain/mergeConfigs.test.ts`
Expected: FAIL — module not found

**Step 3: Implement mergeConfigs**

Create `src/domain/mergeConfigs.ts`:

```ts
import type { OgitConfig } from "./OgitConfig.ts";

export const mergeConfigs = (...configs: ReadonlyArray<OgitConfig>): OgitConfig => {
    const result: Record<string, unknown> = {};
    for (const config of configs) {
        for (const [key, value] of Object.entries(config)) {
            if (value === undefined) continue;
            if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                result[key] = { ...((result[key] as Record<string, unknown>) ?? {}), ...value };
            } else {
                result[key] = value;
            }
        }
    }
    return result as OgitConfig;
};
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/domain/mergeConfigs.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/domain/mergeConfigs.ts test/domain/mergeConfigs.test.ts
ogit commit -n
```

---

### Task 6: OgitConfig Effect Service

**Files:**

- Create: `src/services/OgitConfig.ts`

**Step 1: Implement the OgitConfig service**

Create `src/services/OgitConfig.ts`:

```ts
import { Context, Config, Effect, Layer, Option, Schema } from "effect";
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
                const globalDir = yield* Effect.try(() => envPaths("ogit", { suffix: "" }).config);
                const globalConfig = readAndParseKdl(path.join(globalDir, GLOBAL_CONFIG_FILENAME)) ?? {};

                // 2. Per-repo config (walk up from cwd)
                const cwd = process.cwd();
                const localPath = findConfigFile(cwd);
                const localConfig = localPath ? (readAndParseKdl(localPath) ?? {}) : {};

                // 3. Env var overrides (api-key only)
                const envApiKey = yield* Config.string("OGIT_API_KEY").pipe(Config.option);
                const envConfig: OgitConfigType = Option.isSome(envApiKey) ? { "api-key": envApiKey.value } : {};

                // 4. CLI flag overrides
                const cliConfig: OgitConfigType = overrides.model ? { model: overrides.model } : {};

                // 5. Merge: global < local < env < cli
                const merged = mergeConfigs(globalConfig, localConfig, envConfig, cliConfig);

                return OgitConfigService.of({
                    config: merged,
                    commitSystemPrompt: Option.fromNullable(merged.commit?.["system-prompt"]),
                    model: Option.fromNullable(merged.model),
                    apiKey: Option.fromNullable(merged["api-key"]),
                });
            }),
        );
}
```

**Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/services/OgitConfig.ts
ogit commit -n
```

---

### Task 7: Wire OgitConfig into CommitAi and commit command

**Files:**

- Modify: `src/services/CommitAi.ts` — change `createChat` to accept an optional system prompt string (replacing the entire default when provided)
- Modify: `src/commands/commit.ts` — replace `OGIT_INSTRUCTIONS` usage with `OgitConfigService`, pass config values through

**Step 1: Update CommitAi.createChat**

In `src/services/CommitAi.ts`, change `createChat` to accept an optional `systemPrompt` that **replaces** the default:

- Remove the `instructions` parameter from `createChat`
- Add a `systemPrompt` parameter (optional string)
- When `systemPrompt` is provided, use it directly; otherwise use the hardcoded default
- Remove `buildCommitSystemPrompt` function (replace with a constant `DEFAULT_COMMIT_SYSTEM_PROMPT`)

The service interface becomes:

```ts
readonly createChat: (context: GitContext, systemPrompt?: string) => Effect.Effect<Chat.Service, CommitAiError>;
```

The implementation:

```ts
const DEFAULT_COMMIT_SYSTEM_PROMPT = `You are a git commit message generator. You analyze diffs and produce structured conventional commit messages.

Rules:
- Use conventional commit format: type(scope): short description
- Subject must be imperative mood, max 72 characters, lowercase
- Bullets should summarize WHAT changed and WHY, not HOW
- Group related changes into concise bullet points
- Do NOT mention AI, Claude, or auto-generation
- Common types: feat, fix, refactor, chore, docs, test, perf, style
- Scope is optional — use it when changes are focused on one area`;
```

In `createChat`:

```ts
function* (context: GitContext, systemPrompt?: string) {
    return yield* Chat.fromPrompt([
        { role: "system", content: systemPrompt ?? DEFAULT_COMMIT_SYSTEM_PROMPT },
        { role: "user", content: buildCommitUserPrompt(context) },
    ]);
},
```

**Step 2: Update commit command**

In `src/commands/commit.ts`:

1. Add import: `import { OgitConfigService } from "../services/OgitConfig.ts";`
2. Remove the `OGIT_INSTRUCTIONS` config read (lines 159-161)
3. Replace with:
    ```ts
    const ogitConfig = yield * OgitConfigService;
    ```
4. Change `createChat` call (line 166) to:
    ```ts
    const chat = yield * commitAi.createChat(context, Option.getOrUndefined(ogitConfig.commitSystemPrompt));
    ```
5. Add `Option` to the Effect import
6. In the `Effect.provide` block, add `OgitConfigService.layer({ model: config.model })` to the merged layers
7. Use `ogitConfig.apiKey` as fallback for the Anthropic client config:
    ```ts
    AnthropicClient.layerConfig({
        apiKey: Config.redacted("OGIT_API_KEY").pipe(
            Config.orElse(() =>
                Option.match(ogitConfig.apiKey, {
                    onNone: () => Config.fail("No API key configured"),
                    onSome: (key) => Config.succeed(Redacted.make(key)),
                })
            ),
        ),
    ```
8. Add `Redacted` to the Effect import

**Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: No errors

**Step 4: Manual test**

Run: `echo "test" > /tmp/ogit-test && rm /tmp/ogit-test`

Create a test `.ogit.kdl` in the project root:

```kdl
model "claude-haiku-4-5"
```

Run `ogit commit` on a dirty worktree to verify it picks up the config.
Remove the test config file afterwards.

**Step 5: Commit**

```bash
git add src/services/CommitAi.ts src/commands/commit.ts
ogit commit -n
```

---

### Task 8: Update README and clean up

**Files:**

- Modify: `README.md` — replace `OGIT_INSTRUCTIONS` docs with `.ogit.kdl` config docs
- Modify: `CLAUDE.md` — update if needed

**Step 1: Update README**

- Remove the "Custom instructions" section referencing `OGIT_INSTRUCTIONS`
- Add a "Configuration" section documenting:
    - `.ogit.kdl` file format with example
    - Resolution order (CLI > env > per-repo > global)
    - Global config location per OS
    - That `OGIT_API_KEY` env var still works
    - Example config with `commit { system-prompt """...""" }`

**Step 2: Verify no remaining OGIT_INSTRUCTIONS references**

Run: `grep -r "OGIT_INSTRUCTIONS" src/`
Expected: No matches

**Step 3: Commit**

```bash
git add README.md CLAUDE.md
ogit commit -n
```

---

### Task 9: Run full test suite and typecheck

**Step 1: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No errors

**Step 2: Run all tests**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 3: Lint**

Run: `pnpm lint`
Expected: No errors (or only pre-existing ones)
