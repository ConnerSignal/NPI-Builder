# Security

Report vulnerabilities privately using GitHub's **Report a vulnerability** feature when available. Do not post API keys, private project exports, or exploit details in a public issue. If private reporting is unavailable, request a private reporting channel without including sensitive details.

## Boundaries

- AI is opt-in and calls the selected provider directly. Remote endpoints must use HTTPS; plain HTTP is limited to loopback addresses.
- Browser key persistence is optional and unencrypted. Desktop persistence requires an available OS key store; Linux `basic_text` is rejected.
- Electron isolates and sandboxes the renderer, blocks navigation and new windows, and restricts credential IPC to the expected main frame in an application window.
- Production web assets use a Content Security Policy. HTTPS connections are permitted for user-configured providers. Inline styles remain enabled for the interface; inline scripts are blocked.
- Project files and exports are not encrypted. Project JSON and ZIP exports can include checkpoint history. Local retention is opt-in.
- OS credential encryption does not protect against malware running as the same user or a compromised application renderer.

## Release checks

Run the dependency audit, AI/security tests, production browser tests, and package verification before distributing a build. Inspect uploaded assets independently of the Git tree. Old releases, branches, tags, and commit history can retain removed content.

Electron security guidance: https://www.electronjs.org/docs/latest/tutorial/security

Electron storage guarantees: https://www.electronjs.org/docs/latest/api/safe-storage
