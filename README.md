# StreamThing

StreamThing is a small Windows desktop companion for Syncthing. It helps you open one Syncthing folder, review what is present locally, choose what should stay synchronized, and save the matching `.stignore` rules.

StreamThing does not sync files by itself. Syncthing remains the synchronization engine.

## What It Does

- Reads your local Syncthing configuration.
- Lists available Syncthing folders from the command line.
- Opens the desktop app on one chosen folder.
- Shows a local file tree and uses the Syncthing database when available.
- Generates and saves `.stignore` rules for selective sync.
- Requests a Syncthing scan only when you explicitly refresh, save or ask for one.

## Install

1. Download the latest Windows installer from the GitHub Releases page.
2. Run `StreamThing_*_x64-setup.exe`.
3. Open a new terminal.
4. Check the installed CLI:

```powershell
streamthing --version
```

The installer adds the `streamthing` command to your user `PATH`. If the command is not found immediately after installation, close and reopen your terminal.

The current installer is unsigned, so Windows may show a publisher warning.

## First Use

Make sure Syncthing is running locally, then list active folders:

```powershell
streamthing list-folders --only-active
```

List folders shared with one Syncthing device:

```powershell
streamthing list-folders --device "My Laptop" --only-active
```

Launch StreamThing on a specific folder:

```powershell
streamthing launch --folder-id "my-folder-id" --stop-existing
```

Launch StreamThing on the first active folder shared with a device:

```powershell
streamthing launch --device "My Laptop" --stop-existing
```

Check a folder before launching:

```powershell
streamthing status --folder-id "my-folder-id"
```

## Development

For source builds, install Node.js, Rust and the Tauri prerequisites.

```powershell
npm install
npm run test:file-tree
npm run build
npm run build:cli
npm run build:desktop
```

Build the Windows installer bundle:

```powershell
npm run build:desktop:bundle
```

Create a release folder with installer, standalone CLI, source archive and checksums:

```powershell
npm run package:release
```

## Safety Notes

- Keep your Syncthing API key private.
- StreamThing reads the API key from your local Syncthing `config.xml`; it does not print it in CLI output.
- Startup configuration is written outside the repository and consumed on app launch.
- Use `--allow-paused` only when you intentionally want to inspect or launch a paused Syncthing folder.
- Use `--scan` only when you want StreamThing to request a Syncthing scan.

## More Docs

- [Walkthrough](WALKTHROUGH.md)
- [Technical notes](README.tech.md)
- [Product and technical specs](DOCS/SPECS.md)
- [UI and observability decision](DOCS/DECISION-UI-OBSERVABILITY.md)
