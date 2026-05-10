use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct WatcherState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watcher: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub async fn watch_folder(
    app: AppHandle,
    state: tauri::State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;

    // Drop existing watcher if any to stop watching previous folder
    if let Some(_existing) = watcher_guard.take() {
        // Dropping the watcher stops it
    }

    if path.is_empty() {
        return Ok(());
    }

    let app_handle = app.clone();
    let _path_clone = path.clone();

    // Create a new watcher with debounce to prevent message queue overflow
    let config = Config::default()
        .with_poll_interval(Duration::from_secs(2));
    
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            match res {
                Ok(event) => {
                    // Emit event to frontend
                    let _ = app_handle.emit("fs-change", event);
                }
                Err(e) => {
                    eprintln!("watch error: {:?}", e);
                }
            }
        },
        config,
    )
    .map_err(|e| e.to_string())?;

    // Start watching
    watcher
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Store the watcher
    *watcher_guard = Some(watcher);
    
    println!("Started watching: {}", path);

    Ok(())
}
