# ogit

Git workflow tools powered by AI. `ogit` generates conventional commit messages from your staged diff using Claude.

## Features

- **AI-powered commit messages** — analyzes your staged diff, branch name, status, and recent commits to generate meaningful conventional commit messages
- **Interactive workflow** — review the generated message, then commit, edit, regenerate (with optional feedback), or cancel
- **Non-interactive mode** — automate commits in scripts and AI agent workflows with `--non-interactive`
- **Model selection** — choose any Anthropic model with `--model`

## Installation

```bash
pnpm install
pnpm build
```

This makes the `ogit` command available via the `bin` entry in `package.json`. You can link it globally:

```bash
pnpm link --global
```

## Setup

Set your Anthropic API key:

```bash
export OGIT_API_KEY=sk-ant-...
```

## Usage

### Interactive mode (default)

Stage your changes, then run:

```bash
git add -p
ogit commit
```

ogit will generate a commit message and present a menu:

- **Commit** — accept the message and commit
- **Edit** — open the message in your `$EDITOR` for manual tweaks
- **Regenerate** — generate a new message
- **Regenerate with feedback** — tell the AI what to change and regenerate
- **Cancel** — abort without committing

### Non-interactive mode

```bash
ogit commit -n
```

Generates a commit message and commits immediately without prompting. Useful for scripts and AI agent integrations.

### Model selection

```bash
ogit commit --model claude-sonnet-4-20250514
```

Defaults to `claude-haiku-4-5-20251001`.

## Claude Code Integration

You can configure [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to use `ogit commit` instead of `git commit`, so that all commits made by Claude (and its subagents) get AI-generated messages.

### 1. Add a hook to block `git commit`

In your project's `.claude/settings.json`:

```json
{
  "hooks": {
    "Bash": {
      "pre": [
        {
          "match": "^git commit",
          "command": "echo 'BLOCKED: Use ogit commit instead of git commit' && exit 1"
        }
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

## Built With

- [Effect](https://effect.website/) (v4) — typed functional programming for TypeScript
- [@effect/ai-anthropic](https://github.com/Effect-TS/effect) — Anthropic AI integration for Effect
