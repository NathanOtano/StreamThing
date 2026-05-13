# StreamThing v0.1.2

## Highlights

- Windows installer for the desktop app.
- Installed `streamthing` command for folder listing, status checks, scan requests and app launch.
- Standalone CLI executable published as a release asset.
- Release packaging now produces `SHA256SUMS.txt`.
- Public setup docs now start from a fresh user installation path.
- Fixes folder selection in the desktop file tree so selected folders write recursive `.stignore` include rules.
- Reserves the installed `streamthing` command for the CLI while the desktop binary uses a separate internal executable name.

## Install

Download `StreamThing_*_x64-setup.exe` from this release, run it, then open a new terminal:

```powershell
streamthing --version
streamthing list-folders --only-active
streamthing launch --folder-id "my-folder-id" --stop-existing
```

The installer is currently unsigned.

## Source Build

```powershell
npm install
npm run test:file-tree
npm run build
npm run build:desktop
```
