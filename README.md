# StreamThing

StreamThing is a small desktop companion for Syncthing. It helps you review a Syncthing folder, select what should stay synchronized, and write the matching `.stignore` file from a local interface.

The v1 target is intentionally narrow:

- connect to the local Syncthing REST API;
- list folders from your Syncthing configuration;
- open a desktop UI on one chosen folder;
- compare local files with the Syncthing database when that database is available;
- keep working from the local file tree when a folder is paused or remote browsing is unavailable;
- generate and save `.stignore`;
- ask Syncthing for a scan only when you explicitly refresh or save.

StreamThing does not sync files by itself. Syncthing remains the synchronization engine.

## Screens

- Settings: Syncthing URL, API key, folder ID and local folder path.
- File tree: local and remote entries merged when possible.
- Filters: filename, folder, extension and file-family filters.
- Selection: checked items are kept in sync through generated `.stignore` exceptions.

## Requirements

- Windows for the current desktop build path.
- Syncthing running locally.
- Node.js and npm for development commands.
- Rust and the Tauri prerequisites for desktop builds.

The CLI reads the Syncthing API key from your local Syncthing `config.xml`. It does not print the key, and generated startup configuration is stored outside the repository.

## Quick Start

Install dependencies:

```powershell
npm install
```

List active Syncthing folders:

```powershell
npm run streamthing -- list-folders -OnlyActive
```

List active folders shared with one known Syncthing device:

```powershell
npm run streamthing -- list-folders -Device "My Laptop" -OnlyActive
```

Launch the app on the first active matching folder:

```powershell
npm run streamthing -- launch -Device "My Laptop" -StopExisting
```

Launch the app on a specific folder:

```powershell
npm run streamthing -- launch -FolderId "my-folder-id" -StopExisting
```

Check a folder before launching:

```powershell
npm run streamthing -- status -FolderId "my-folder-id"
```

## Development

```powershell
npm run test:file-tree
npm run build
npm run build:desktop
```

`npm run build:desktop` builds the Tauri executable without creating an installer bundle.

## Safety Notes

- Keep your Syncthing API key private.
- Do not commit generated local startup files.
- Use `-AllowPaused` only when you intentionally want to inspect or launch a paused Syncthing folder.
- Use `-Scan` only when you want StreamThing to request a Syncthing scan during launch.

## More Docs

- [Product and technical specs](DOCS/SPECS.md)
- [Walkthrough](WALKTHROUGH.md)
- [Technical notes](README.tech.md)
- [UI and observability decision](DOCS/DECISION-UI-OBSERVABILITY.md)
- [Public release audit](DOCS/PUBLIC-RELEASE-AUDIT.md)
