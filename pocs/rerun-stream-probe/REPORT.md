# Rerun StreamThing Probe

## Result

Rerun is useful as a development-only probe for synthetic stream timelines, latency, buffer depth and event inspection.

It is not part of the StreamThing v1 runtime.

## Run Locally

```powershell
python pocs/rerun-stream-probe/generate_probe.py
```

Generated `.rrd` files are written under the ignored `out/` directory.

## Product Reading

StreamThing v1 is scoped to Syncthing folder selection and `.stignore` generation. Rerun remains a separate diagnostic experiment.
