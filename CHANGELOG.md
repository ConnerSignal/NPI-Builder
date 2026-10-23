# Changelog

All notable changes to NPI Builder will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions release workflow for automated builds, checksums, and release creation

### Known Limitations
- Desktop builds are currently unsigned (verify checksums before running a download)

## [0.1.0] - 2026-10-23

### Added
- NPI document builder with guided workflow (PCD, PRD, PDD, SDD, HLD, LLD, Risk Register, Launch Checklist, Post-Launch Review)
- AI assistance via OpenAI-compatible providers (OpenAI, xAI/Grok, GitHub Copilot, Ollama, custom endpoints)
- Privacy controls: opt-in AI transfers, local retention, secure key storage
- Multi-format export: PDF, DOCX, Markdown, ZIP
- Content Security Policy for production builds
- Comprehensive test suite (AI/security + UI with Playwright)
- CI/CD: dependency audit, build, browser tests, package inspection
- Auto-save with checkpoint/resume, recovery banner
- Keyboard shortcuts: ⌘S checkpoint, ⌘→/← navigation, / focus ProdBot, ⌘K wizard
- ProdBot co-pilot for contextual queries and workflow suggestions
- Electron security hardening (IPC isolation, sandbox, navigation restrictions, secure storage)

### Security
- HTTPS-only for remote endpoints; local loopback (localhost, 127.0.0.1, ::1) supports HTTP
- Content Security Policy in production builds (inline scripts blocked, styles allowed)
- IPC trusted sender validation, browser navigation blocking
- OS-backed secure storage on supported platforms (rejects Linux basic_text)
- Browser builds keep AI keys in memory only by default
- Project files and exports are not encrypted (user controls what to share)

### Tech Stack
- React 19, TypeScript, Vite, Playwright, Electron
- Node.js 22.12+
- OpenAI-compatible API client with fallback support

[Unreleased]: https://github.com/ConnerSignal/NPI-Builder/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ConnerSignal/NPI-Builder/releases/tag/v0.1.0
