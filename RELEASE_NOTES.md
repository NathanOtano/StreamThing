# StreamThing v0.1.0

Initial source release.

## Highlights

- Desktop app for Syncthing selective synchronization via `.stignore`.
- Local Syncthing REST API connection.
- File tree with local fallback when remote database browsing is unavailable.
- Filters by name, folder, extension and file family.
- `.stignore` generation and save flow.
- CLI for listing folders, checking status, preparing launch config and starting the desktop app.
- User-focused setup docs and examples.

## Quick Commands

```powershell
npm install
npm run streamthing -- list-folders -OnlyActive
npm run streamthing -- launch -FolderId "my-folder-id" -StopExisting
npm run build:desktop
```

