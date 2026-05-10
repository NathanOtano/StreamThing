# Public Release Audit

Date: 2026-05-09.

## Verdict

The source tree is prepared for a public source release after the privacy cleanup in this branch.

Do not make a private development repository public directly if its Git history contains local paths, private machine names, Syncthing folder IDs, device IDs or other personal metadata. Publish from a clean source archive, a history-scrubbed branch or a new public repository.

## Checked Surfaces

- README and walkthrough documentation.
- Product specs and v1 audit docs.
- CLI script and app startup configuration path.
- Tauri identifier and Rust package authors.
- Development probe reports.
- Tracked TODO mirror.

## Cleanup Applied

- Removed local agent/repo workflow docs from the public tree.
- Replaced personal folder, device and machine examples with placeholders.
- Changed app identifier and app-data directory from a personal namespace to `io.streamthing.app`.
- Removed private absolute paths from public docs and benchmark reports.
- Kept Syncthing API keys runtime-only and out of CLI output.
- Moved generated Syncthing benchmark reports under ignored `out/`.

## Release Boundary

Safe public artifact:

- a source archive created from the cleaned working tree;
- or a public repository initialized from that cleaned tree without private history.

Unsafe artifact:

- toggling the existing private repository to public without history review;
- publishing generated local benchmark outputs;
- publishing local app-data startup files.

## Suggested Manual Check

Before publishing, run a final leak scan against the exact source tree or archive contents:

```powershell
rg -n --hidden --glob '!node_modules/**' --glob '!src-tauri/target/**' --glob '!dist/**' --glob '!.git/**' --glob '!.git' "<private-path>|<private-device>|<private-folder-id>|<secret-token>" .
```

Expected result: no real personal path, API key, device ID or private folder ID.
