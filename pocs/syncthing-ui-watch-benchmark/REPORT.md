# Syncthing UI / Watcher Benchmark

This probe measures the local file tree, Syncthing API latency and watcher responsiveness used by StreamThing.

## Privacy Note

Generated benchmark results can contain local folder labels and filesystem paths. For public releases, generated reports are written to the ignored `out/` directory.

Run locally:

```powershell
npm run benchmark:syncthing-ui
```

The script writes:

- `pocs/syncthing-ui-watch-benchmark/out/results-*.json`
- `pocs/syncthing-ui-watch-benchmark/out/REPORT.local.md`

Do not commit generated local outputs unless they have been reviewed and redacted.

## What It Measures

- Syncthing REST endpoints such as ping, folder config, folder status and database browsing.
- Local file listing and tree merge cost.
- Filter, toggle and row projection cost.
- Filesystem watcher latency.

## Product Reading

The benchmark is a development probe. It does not ship in the product runtime and is not required to use StreamThing.
