# Changelog

All notable changes to the tesseract VS Code extension are documented here.

## [0.1.0]

Initial release — a minimal, iframe-only client for a locally running tesseract
server.

- Open a running local tesseract server in an editor-beside panel.
- **tesseract: Open** command, available from the editor-title bar and the
command palette, plus an activity-bar view with an "Open tesseract" button.
- Automatically discovers a local server via `~/.omnigent/local_server.pid`, or
point the extension at one with the `omnigent.serverUrl` setting. Localhost
servers only in this build.

