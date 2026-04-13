# ogit

Git workflow tools powered by AI. `ogit` generates conventional commit messages from your staged diff using Claude.

## Features

- **AI-powered commit messages** — analyzes your staged diff, branch name, status, and recent commits to generate meaningful conventional commit messages
- **Intelligent auto-staging** — when nothing is staged, AI triages files by name, filters out binaries and generated files, analyzes diffs for relevance, and lets you exclude unrelated changes
- **Interactive workflow** — review the generated message, then commit, edit, regenerate (with optional feedback), or cancel
- **Non-interactive mode** — automate commits in scripts and AI agent workflows with `--non-interactive`
- **Layered configuration** — configure via `.ogit.kdl` config files (global and per-repo), environment variables, and CLI flags
- **Model selection** — choose any Anthropic model with `--model` or in config

## Installation

```bash
pnpm install
pnpm build
```

This makes the `ogit` command available via the `bin` entry in `package.json`. You can link it globally:

```bash
pnpm link --global
```

## Usage

### Interactive mode (default)

Just run:

```bash
ogit commit
```

If you have staged changes, ogit generates a commit message from them. If nothing is staged, ogit **auto-stages** your changes using a two-phase AI workflow:

1. **Triage** — AI classifies unstaged files by name, filtering out generated/output files (e.g. `dist/`, lock files)
2. **Analysis** — AI reads the diffs of remaining files and groups them by relevance to the current branch
3. **Review** — if some files seem unrelated, ogit lists them and asks whether to exclude them from this commit

You can also stage manually first if you prefer:

```bash
git add -p
ogit commit
```

Once changes are staged, ogit generates a commit message and presents a menu:

- **Commit** — accept the message and commit
- **Edit** — open the message in your `$EDITOR` for manual tweaks
- **Regenerate** — generate a new message
- **Regenerate with feedback** — tell the AI what to change and regenerate
- **Cancel** — abort without committing

### Non-interactive mode

```bash
ogit commit -n
```

Generates a commit message and commits immediately without prompting. If nothing is staged, all changes are added (`git add -A`) before generating. Useful for scripts and AI agent integrations.

### Show system prompt

```bash
ogit commit --show-prompt
```

Prints the default system prompt used for commit message generation. If a custom prompt is configured in `.ogit.kdl`, both the default and custom prompts are shown. Does not require an API key.

### Model selection

```bash
ogit commit --model claude-sonnet-4-20250514
```

Defaults to `claude-haiku-4-5` (configurable via `.ogit.kdl`).

## Configuration

ogit uses [KDL](https://kdl.dev/) config files with a layered resolution order:

1. **Global config** — `~/.config/ogit/config.kdl` (Linux), `~/Library/Application Support/ogit/config.kdl` (macOS), `%APPDATA%\ogit\config.kdl` (Windows)
2. **Per-repo config** — `.ogit.kdl` in the current directory or any parent (walks up to find the nearest one)
3. **Environment variables** — `OGIT_API_KEY`
4. **CLI flags** — `--model`

Later sources override earlier ones.

### Example `.ogit.kdl`

```kdl
api-key "sk-ant-..."
model "claude-sonnet-4-20250514"

commit {
    system-prompt """
        You are a git commit message generator.
        Write commit messages in Swiss Standard German.
        Never use Eszett (ß), always use Umlauts (ä, ö, ü).
        Use conventional commit format: type(scope): short description.
        """
}
```

### Config options

| Key                        | Type   | Description                                          |
| -------------------------- | ------ | ---------------------------------------------------- |
| `api-key`                  | string | Anthropic API key (also via `OGIT_API_KEY` env var)  |
| `model`                    | string | Anthropic model to use (default: `claude-haiku-4-5`) |
| `commit { system-prompt }` | string | Custom system prompt that replaces the default       |

### API key

Set your API key via config file or environment variable:

```bash
export OGIT_API_KEY=sk-ant-...
```

Or in `.ogit.kdl`:

```kdl
api-key "sk-ant-..."
```

## Claude Code Integration

You can configure [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to use `ogit commit` instead of `git commit`, so that all commits made by Claude (and its subagents) get AI-generated messages.

### 1. Add a hook to block `git commit`

In your project's `.claude/settings.json`:

```json
{
    "hooks": {
        "Bash": {
            "pre": [
                { "match": "^git commit", "command": "echo 'BLOCKED: Use ogit commit instead of git commit' && exit 1" }
            ]
        }
    }
}
```

This intercepts any Bash tool call starting with `git commit` and returns an error before it executes.

### 2. Add a CLAUDE.md instruction

Add this to your project's `CLAUDE.md` so Claude uses `ogit` from the start (avoiding the hook entirely):

```markdown
## Committing

Never use `git commit` directly. After staging files with `git add`, always use `ogit commit -n` to create commits. This generates AI-powered commit messages from the staged diff in non-interactive mode.
```

### How it works

1. Claude stages files with `git add` as normal
2. When it tries `git commit`, the hook blocks it with an error
3. The error message tells Claude to use `ogit commit` instead
4. Claude runs `ogit commit -n` (non-interactive mode)
5. ogit analyzes the staged diff, generates a commit message, and commits

The `CLAUDE.md` instruction reduces wasted attempts — Claude will use `ogit commit` directly without hitting the hook.

## Shell Completions

ogit supports tab completions for Bash, Zsh, and Fish.

### Bash

```bash
ogit --completions bash >> ~/.bashrc
```

### Zsh

```bash
ogit --completions zsh > ~/.zsh/completions/_ogit
```

Then add `~/.zsh/completions` to your `fpath` in `~/.zshrc`:

```bash
fpath=(~/.zsh/completions $fpath)
```

### Fish

```bash
ogit --completions fish > ~/.config/fish/completions/ogit.fish
```

## Built With

- [Effect](https://effect.website/) (v4) — typed functional programming for TypeScript
- [@effect/ai-anthropic](https://github.com/Effect-TS/effect) — Anthropic AI integration for Effect
