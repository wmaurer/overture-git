# Contributing

Contributions are welcome! This is an opinionated tool built around a specific workflow, so please read the guidelines below before opening a PR.

## What's welcome without prior discussion

- Bug fixes
- Code quality improvements (minor refactoring, test coverage, typos)
- Documentation improvements

## What needs an issue first

- New features or commands
- Changes to existing behavior
- Dependency changes

If in doubt, open an issue to discuss before writing code. Feature PRs without a prior discussion will likely be closed.

## Development setup

This project uses [pnpm](https://pnpm.io/) and [Effect v4](https://effect.website/) (beta).

```bash
pnpm install
pnpm build
pnpm test
```

### Useful commands

| Command          | Description                   |
| ---------------- | ----------------------------- |
| `pnpm build`     | Compile TypeScript to `dist/` |
| `pnpm dev`       | Watch mode                    |
| `pnpm test`      | Run tests                     |
| `pnpm typecheck` | Type-check without emitting   |
| `pnpm lint`      | Lint with oxlint              |
| `pnpm fmt`       | Format with oxfmt             |
| `pnpm fmt:check` | Check formatting              |

## Before submitting a PR

1. Run `pnpm test` — all tests must pass
2. Run `pnpm typecheck` — no type errors
3. Run `pnpm fmt:check` — code must be formatted
