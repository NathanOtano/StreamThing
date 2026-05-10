# StreamThing Technical Notes

StreamThing is a desktop app built with `Tauri + Solid`.

## Surfaces

- `src/`: Solid frontend, state, filters, file tree and `.stignore` orchestration.
- `src/utils/`: pure logic tested without Tauri.
- `src-tauri/`: native commands for Syncthing, filesystem access, watcher and path opening.
- `scripts/streamthing.ps1`: CLI for terminal and automation workflows.
- `pocs/`: development-only probes and benchmarks.
- `DOCS/`: specs and architecture decisions.

## CLI Behavior

The CLI reads local Syncthing configuration, resolves folders and devices, and writes a one-shot startup file under the app-data directory:

```text
<LOCALAPPDATA>\io.streamthing.desktop\startup-config.json
```

The Tauri app consumes and deletes that file during startup. This keeps runtime secrets out of the repository and avoids fragile WebView storage injection.

Examples:

```powershell
npm run streamthing -- list-folders -OnlyActive -Json
npm run streamthing -- list-folders -Device "My Laptop" -OnlyActive -Json
npm run streamthing -- status -FolderId "my-folder-id" -Json
npm run streamthing -- launch -FolderId "my-folder-id" -StopExisting -Json
```

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
npm run streamthing -- list-folders -OnlyActive -Json
npm run build
npm run build:desktop
```
