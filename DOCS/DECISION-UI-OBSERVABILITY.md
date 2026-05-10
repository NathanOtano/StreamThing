# Decision: UI and Observability

## Status

Active for v1.

## Decision

StreamThing keeps `Tauri + Solid` as the main product UI.

Rerun remains a development-only probe for synthetic stream and latency timelines. It is not a runtime dependency of the product.

Terminal and automation needs are handled by the repo CLI, not by a second GUI.

`egui` is not selected for v1.

## Reasons

- The current product risk is Syncthing state, folder availability, watcher behavior and `.stignore` generation.
- The existing Tauri/Solid shell is enough for settings, tree browsing, filtering and save actions.
- Rewriting the UI in `egui` would not solve the main synchronization and folder-state problems.
- A CLI gives automation a stable contract without duplicating the visual product.

## Consequences

- Optimize the existing Tauri/Solid path before considering a UI rewrite.
- Keep Syncthing scans tied to deliberate user or CLI actions.
- Keep Rerun in `pocs/` or dev-only scripts.
- Reconsider `egui` only if a no-WebView Windows-native app becomes a primary goal.
