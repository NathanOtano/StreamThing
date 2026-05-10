# StreamThing Walkthrough

This walkthrough starts from a local Syncthing installation and ends with StreamThing opened on one folder.

## 1. Start Syncthing

Make sure Syncthing is running on your computer. The default local web UI is usually:

```text
http://127.0.0.1:8384
```

StreamThing reads Syncthing's local `config.xml` to find the REST URL, API key, folders and devices.

## 2. Install StreamThing

Download the latest `StreamThing_*_x64-setup.exe` from GitHub Releases and run it.

Open a new terminal and verify the CLI:

```powershell
streamthing --version
```

If Windows cannot find `streamthing`, close and reopen the terminal so it reloads your user `PATH`.

## 3. List Folders

Show active folders:

```powershell
streamthing list-folders --only-active
```

Show folders shared with a specific Syncthing device:

```powershell
streamthing list-folders --device "My Laptop" --only-active
```

Use the folder `Id` from this output in later commands.

## 4. Check Folder Status

```powershell
streamthing status --folder-id "my-folder-id"
```

Look for:

- `State`: `idle`, `scanning`, `syncing`, etc.
- `NeedFiles`: files still needed locally.
- `Paused`: whether the folder is paused in Syncthing.

## 5. Launch the Desktop App

Launch by folder:

```powershell
streamthing launch --folder-id "my-folder-id" --stop-existing
```

Launch by device:

```powershell
streamthing launch --device "My Laptop" --stop-existing
```

The CLI writes a one-shot startup config outside the repository. StreamThing consumes it at startup, opens the selected folder, then deletes that startup file.

## 6. Select Files

In the app:

1. Open settings if the selected folder is not loaded.
2. Review the folder path and Syncthing state.
3. Expand the file tree.
4. Use filters to narrow the list.
5. Select files or folders to keep synchronized.
6. Save to write `.stignore`.

StreamThing asks Syncthing for a scan after save. It does not request a scan for every local filesystem event.

## 7. Inspect the Result

Open the folder and check `.stignore`. The generated file should contain a deny-by-default pattern plus exceptions for selected paths.

## Source Build Fallback

If you build from source instead of using the installer:

```powershell
npm install
npm run build:cli
npm run build:desktop
npm run streamthing -- list-folders -OnlyActive
```

The PowerShell `npm run streamthing` command is kept as a source-tree fallback. The installed release command is `streamthing`.

## Troubleshooting

- If no folder appears, check that Syncthing is running and has a `config.xml`.
- If a folder is paused, either unpause it in Syncthing or add `--allow-paused` for inspection-only workflows.
- If remote database browsing fails, StreamThing should still show local files.
- If the app does not switch folders, relaunch with `--stop-existing`.
- If the desktop build fails from source, verify Rust and Tauri prerequisites, then run `npm run build` before `npm run build:desktop`.
