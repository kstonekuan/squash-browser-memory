# History Workflow Analyzer - Claude Instructions

## Check Command

Always run `pnpm check` before committing or after making significant changes. This command runs:
- Biome linting and formatting
- TypeScript type checking
- Svelte checking
- Unit tests

The check command is automatically run before builds to ensure code quality.

## Commands
- `pnpm dev` - Start development server
- `pnpm build` - Run checks and build both web app and browser extension
- `pnpm check` - Run all quality checks
- `pnpm test` - Run tests in watch mode
- `pnpm test:ui` - Run tests with UI

## Build Output
- Web app: `dist/`
- Browser extension: `dist-extension/`