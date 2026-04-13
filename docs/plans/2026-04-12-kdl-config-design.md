# KDL Config File Design

## Goal

Replace environment-variable-based configuration with a KDL config file (`@bgotink/kdl`), introducing a layered config resolution system. The `OGIT_INSTRUCTIONS` environment variable is removed entirely.

## Config File

- **Format**: Idiomatic KDL v2, parsed with `@bgotink/kdl`
- **Filename**: `.ogit.kdl`

### Example

```kdl
api-key "sk-ant-..."
model "claude-sonnet-4-20250514"

commit {
    system-prompt """
        You are a git commit message generator. You analyze
        diffs and produce structured conventional commit messages.

        Rules:
        - Use conventional commit format: type(scope): short description
        - Subject must be imperative mood, max 72 characters, lowercase
        - Do NOT mention AI, Claude, or auto-generation
        """
}
```

## Resolution Order (highest priority wins)

1. **CLI flags** (`--model`, etc.)
2. **Environment variables** (`OGIT_API_KEY` — API key only)
3. **Nearest `.ogit.kdl`** — walk up from cwd to filesystem root
4. **Global config** — OS-appropriate path via `env-paths("ogit")`:
    - Linux: `~/.config/ogit/config.kdl`
    - macOS: `~/Library/Preferences/ogit/config.kdl`
    - Windows: `%APPDATA%\ogit\Config\config.kdl`

## Config Keys (initial)

| Key                    | Type              | Description                                               |
| ---------------------- | ----------------- | --------------------------------------------------------- |
| `api-key`              | string (optional) | Anthropic API key. Env var `OGIT_API_KEY` takes priority. |
| `model`                | string (optional) | Default model name. CLI `--model` takes priority.         |
| `commit.system-prompt` | string (optional) | **Replaces** the default commit system prompt entirely.   |

Additional keys will be added later as needed.

## Key Behaviors

- `commit.system-prompt` **replaces** the default system prompt (not appends)
- If no `commit.system-prompt` is configured, the hardcoded default is used
- `OGIT_INSTRUCTIONS` environment variable is **removed**
- `api-key` in config is optional — `OGIT_API_KEY` env var still works
- Per-repo config is found by walking up directories from cwd (like ESLint/tsconfig)

## Implementation: `OgitConfig` Effect Service

```ts
class OgitConfig extends Context.Service<OgitConfig, {
  readonly apiKey: Option<Redacted>
  readonly model: string
  readonly commit: { readonly systemPrompt: Option<string> }
}>()("@ogit/Config") { ... }
```

The layer:

1. Resolve global config path via `env-paths` (wrapped in `Effect.try`)
2. Walk up from cwd to find nearest `.ogit.kdl`
3. Parse each KDL file with `@bgotink/kdl` → small transformer → plain object
4. Decode with Effect Schema
5. Merge: global < per-repo < env vars < CLI flags

## KDL Integration

- Parse KDL with `@bgotink/kdl` (`parse()` returns a `Document` with nodes)
- Small transformer function (~20 lines) walks `Document.nodes` into a plain JS object
- Feed plain object into `Schema.decodeUnknown(OgitConfigSchema)` for typed validation
- No need for `@bgotink/kdl/dessert` or `@bgotink/kdl/json` — Effect Schema handles validation

## New Dependencies

- `@bgotink/kdl` — KDL parser (pure JS, zero deps)
- `env-paths` — cross-platform config directory resolution (zero deps)

## What's Removed

- `OGIT_INSTRUCTIONS` environment variable
- `buildCommitSystemPrompt` function (system prompt comes from config or default)
