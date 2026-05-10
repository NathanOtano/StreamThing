# StreamThing Technical Notes

StreamThing is a desktop app built with `Tauri + Solid`.

## Surfaces

- `src/`: Solid frontend, state, filters, file tree and `.stignore` orchestration.
- `src/utils/`: pure logic tested without Tauri.
- `src-tauri/`: native commands for Syncthing, filesystem access, watcher and path opening.
- `src-tauri/cli/`: native CLI distributed with the Windows installer.
- `scripts/streamthing.ps1`: source-tree CLI fallback for development.
- `scripts/prepare-sidecars.ps1`: builds the native CLI sidecar for Tauri bundles.
- `scripts/package-release.ps1`: builds release assets and `SHA256SUMS.txt`.
- `pocs/`: development-only probes and benchmarks.
- `DOCS/`: specs and architecture decisions.

## CLI Behavior

The native CLI reads local Syncthing configuration, resolves folders and devices, and writes a one-shot startup file under the app-data directory:

```text
<LOCALAPPDATA>\io.streamthing.desktop\startup-config.json
```

The Tauri app consumes and deletes that file during startup. This keeps runtime secrets out of the repository and avoids fragile WebView storage injection.

Examples:

```powershell
streamthing list-folders --only-active --json
streamthing list-folders --device "My Laptop" --only-active --json
streamthing status --folder-id "my-folder-id" --json
streamthing launch --folder-id "my-folder-id" --stop-existing --json
```

Source-tree fallback:

```powershell
npm run streamthing -- list-folders -OnlyActive -Json
```

## Release Packaging

The Windows bundle includes:

- the Tauri desktop app;
- `streamthing-cli.exe`;
- `streamthing.cmd`, installed as the user-facing `streamthing` command;
- a user `PATH` update for the installation directory.

Release packaging also builds with a Rust path-remap flag so generated binaries do not retain the local source checkout path.

```powershell
npm run package:release
```

The release folder contains the NSIS installer, a standalone CLI executable, a source archive and `SHA256SUMS.txt`.

## Security and Privacy

- The Syncthing API key is read from local `config.xml` and should never be committed.
- CLI JSON output intentionally omits the API key.
- The startup file is outside the repo and is consumed at launch.
- Generated benchmark output is written under ignored `out/` folders.
- Release artifacts should be built from the tracked source tree after privacy and secret scans.

## UI Choice

The v1 UI remains `Tauri + Solid`. `egui` is a future option if the project needs a Windows-native, no-WebView application. It is not the final choice for v1.

## Verification

```powershell
npm run test:file-tree
npm run build
npm run build:cli
npm run build:desktop
npm run package:release
```
