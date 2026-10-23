# Contributing to NPI Builder

First, thank you for your interest in contributing! This project is built with care around privacy, security, and local-first principles.

## Code of Conduct

This project follows a simple code of conduct: be respectful, focus on the problem, and keep AI transfers opt-in and local by default.

## Getting Started

1. Fork and clone the repository
2. Install dependencies: `npm ci`
3. Run the dev server: `npm run dev`
4. Build the desktop app: `npm run build`
5. Run tests: `npm run test:ai && npm run test:ui`
6. Package: `npm run dist:win`

## Development Workflow

### Project structure
- `src/` — React application code
- `electron/` — Electron main/preload code
- `tests/` — Playwright UI tests and AI settings tests
- `scripts/` — Utility scripts (e.g., package verification)

### Testing
Run the test suite:
```bash
npm run test:ai  # AI connection, credentials, fallback, security
npm run test:ui  # Playwright UI tests in headless Chrome
```

On Windows, you can test the production build:
```bash
npm run build
npx playwright install chromium
PLAYWRIGHT_PREVIEW=1 npm run test:ui
```

### Security guidelines
- Never commit API keys or secrets (they’re redacted in logs)
- Local AI requests are opt-in and don’t send data by default
- Electron IPC uses trusted sender validation
- Use HTTPS for remote AI endpoints; localhost loopback is allowed for keyless access

## Project goals
This tool is designed for local-first, privacy-conscious NPI documentation work. When making changes:
1. Keep AI transfers opt-in by default
2. Maintain content security and privacy controls
3. Preserve cross-platform compatibility (Windows, macOS, Linux where supported)
4. Run tests before any PR

## Submitting a Pull Request

1. Create a feature branch: `git checkout -b feature/amazing-feature`
2. Make your changes and run tests
3. Ensure:
   - No new npm audit vulnerabilities
   - All tests pass
   - No console errors in dev mode
4. Commit with conventional commit style (e.g., `feat: add export option`, `fix: security`)
5. Push and create a PR with a clear description

## License

By contributing, you agree that your contribution will be licensed under the MIT License.

## Questions?

Open an issue for technical questions, or reach out to maintainers.