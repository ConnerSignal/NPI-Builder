# NPI Builder

Build New Product Introduction documents locally, with optional AI assistance using your own provider and API key.

The guided workflow covers PCD, PRD, PDD, SDD, HLD, LLD, Risk Register, Launch Checklist, and Post-Launch Review. Edit sections, propagate context between documents, save checkpoints, and export PDF, DOCX, Markdown, or a project ZIP.

## Quick start

Requires Node.js 22.12 or later and npm.

```powershell
npm ci
npm run dev
```

Open http://localhost:5173. Start with the project context, then work through the documents. To run Electron during development, keep Vite running and run `npm run dev:electron` in another terminal.

## AI settings and privacy

AI transfers and local project retention are off by default. Enable each explicitly in Privacy Controls. AI requests send your messages, project context, and relevant document sections to the provider you configure. An enabled fallback may send the same content to its configured provider.

Remote endpoints require HTTPS. HTTP is accepted only for localhost, 127.0.0.1, and ::1, including local Ollama. Browser providers must allow cross-origin requests (CORS).

Use **Test connection** to verify the primary endpoint, model, and key. This sends only a fixed greeting, even when project transfers are disabled; it does not use fallback or project content. Tests time out after 30 seconds; generation requests after 90 seconds per attempt.

Browser keys stay in memory unless you enable **Remember my AI key**. Remembered browser keys are stored without encryption. Desktop keys use the operating system's secure storage when available; unsupported Linux key stores fall back to session-only keys. OS storage protects data at rest, not against malicious software running as you or a compromised renderer.

Project exports contain your document content, metadata, and, for project JSON/ZIP, saved history. Review exports before sharing them. No filled project examples are included in the source or application.

## Desktop packages

```powershell
npm run dist:win       # Windows portable executable
npm run dist:win-dir   # Unpacked Windows application
npm run dist:linux     # Linux AppImage; build on Linux
```

Web assets go to `dist/`. Desktop artifacts go to `release/`; those directories must remain separate. Packaging includes only the intended web assets and Electron entry points. Verify the Windows archive with:

```powershell
node scripts/verify-package.cjs
```

For a clean hosted build, use GitHub Actions > **Build & Package** > **Run workflow**. CI runs the dependency audit, AI/security tests, production build, browser tests, and package inspection before uploading the portable executable. Release publishing is a separate step.

Desktop builds are currently unsigned. Verify the source and release checksum before running a download. If packaging encounters a permissions error, close the running app and try a short local checkout path or GitHub Actions. Do not disable security software or run builds as Administrator.

## Verification

```powershell
npm run test:ai
npm run build
npx playwright install chromium
npm run test:ui
npm audit
```

Set `PLAYWRIGHT_PREVIEW=1` to test the production build and its Content Security Policy. On Windows, `PLAYWRIGHT_CHANNEL=msedge` uses installed Edge. Automated AI tests use synthetic credentials and a local mock server; they do not call a real AI account.

The targeted `global-agent` override removes an obsolete vulnerable logging dependency from the Electron download tooling. Recheck the override when upgrading electron-builder. Dependency audits are a point-in-time check and should be repeated before each release.

## Workflow

See the [interactive workflow diagram](NPI-Builder-Workflow.html).

## Security

See [SECURITY.md](SECURITY.md) for security boundaries and reporting guidance.
