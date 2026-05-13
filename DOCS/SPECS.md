# StreamThing v1 Specs

StreamThing is a `Tauri + Solid` desktop app for managing selective synchronization in a Syncthing folder through `.stignore`.

## Product Scope

StreamThing v1 must let a local user:

- connect to the local Syncthing REST API with a URL, API key and folder ID;
- read the local path for a Syncthing folder;
- browse local files and, when Syncthing exposes it, the remote database tree;
- keep the UI usable when Syncthing remote browsing is unavailable;
- filter files by name, parent folder, extension and file family;
- select files and folders that should remain synchronized;
- preserve directory entries as folders when local and Syncthing database listings are merged;
- read, generate and save `.stignore`;
- request a Syncthing scan only on deliberate actions: save, `.stignore` change, manual refresh or explicit CLI `--scan`;
- launch the app from a CLI on a chosen folder or device without hand-editing browser storage.

## Out of Scope

- File synchronization implementation. Syncthing owns sync.
- Media playback or streaming.
- Cloud deployment or network service mode.
- Runtime Rerun integration.
- Advanced multi-folder management inside the GUI.
- Rewriting the v1 UI in `egui`.

## Architecture

- `src/`: Solid UI, app state, filters, file tree and `.stignore` orchestration.
- `src-tauri/`: native commands for Syncthing API calls, filesystem reads/writes, watcher and path opening.
- `src-tauri/cli/`: native CLI for listing folders, checking status, preparing startup config, scanning and launching.
- `scripts/streamthing.ps1`: source-tree CLI fallback for development.
- `scripts/package-release.ps1`: release asset packager for installer, standalone CLI, source archive and checksums.
- `pocs/`: development-only probes and benchmarks.

The app and the CLI communicate through a one-shot startup file under the platform app-data directory. The Tauri app consumes that file on launch, applies the selected folder, stores the entry in local UI history, then deletes the startup file.

## CLI Contract

Commands:

- `list-folders`: list folders from local Syncthing config.
- `status`: show Syncthing status for one folder.
- `configure`: write startup config without launching.
- `launch`: write startup config and start the desktop app.
- `scan`: request a Syncthing scan for one active folder.

The installed `streamthing` command must resolve to the CLI wrapper, not to the desktop GUI executable.

Useful options:

- `--device "<device name>"` / `-Device "<device name>"`: restrict folders to one Syncthing device.
- `--folder-id "<folder id>"` / `-FolderId "<folder id>"`: choose one folder exactly.
- `--only-active` / `-OnlyActive`: hide paused folders in listing.
- `--allow-paused` / `-AllowPaused`: permit actions on paused folders.
- `--stop-existing` / `-StopExisting`: close a running StreamThing before relaunching.
- `--scan` / `-Scan`: request a scan during launch.
- `--json` / `-Json`: machine-readable output.

## UI Decision

`Tauri + Solid` is the v1 product choice. `egui` remains a future option for a Windows-native app without WebView, but the current bottlenecks are Syncthing state, folder availability and `.stignore` behavior rather than WebView rendering.

## Privacy and Public-Release Requirements

- The repository must not contain personal machine names, private filesystem paths, Syncthing device IDs, API keys or local folder IDs.
- Examples must use placeholder values.
- The CLI must read secrets from local Syncthing configuration at runtime and must not print the API key.
- Generated local artifacts must stay ignored or outside the repository.
- Release artifacts must be built from the tracked source tree after privacy and secret scans.
- Public release assets must include a Windows installer, a standalone CLI executable and `SHA256SUMS.txt`.
- Release builds should remap local source paths so published binaries do not retain the build checkout path.

## Verification

Required before a release:

```powershell
npm run test:file-tree
npm run build
npm run build:cli
npm run build:desktop
npm run package:release
```

Runtime acceptance for the desktop app also requires a Syncthing sandbox check that selects a folder in the file tree and verifies that `.stignore` contains both `!/folder` and `!/folder/**`.

For privacy review:

```powershell
rg -n --hidden --glob '!node_modules/**' --glob '!src-tauri/target/**' --glob '!dist/**' --glob '!.git/**' --glob '!.git' "<private-path>|<private-device>|<private-folder-id>|<secret-token>" .
```
