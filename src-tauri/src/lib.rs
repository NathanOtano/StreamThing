mod syncthing;
mod stignore;
mod startup;
mod watcher;

use syncthing::{SyncthingConfig, FileNode};
use stignore::IgnoreItem;
use watcher::WatcherState;

#[tauri::command]
async fn fetch_files(config: SyncthingConfig, folder_id: String, prefix: String) -> Result<Vec<FileNode>, String> {
    syncthing::get_folder_tree(&config, &folder_id, &prefix).await
}

#[tauri::command]
async fn check_connection(config: SyncthingConfig) -> Result<bool, String> {
    syncthing::check_connection(&config).await
}

#[tauri::command]
async fn get_folder_path(config: SyncthingConfig, folder_id: String) -> Result<String, String> {
    syncthing::get_folder_path(&config, &folder_id).await
}

#[tauri::command]
async fn save_ignore(path: String, items: Vec<IgnoreItem>) -> Result<(), String> {
    let content = stignore::generate_stignore(items);
    stignore::write_ignore_file(&path, &content)
}

#[tauri::command]
async fn read_ignore(path: String) -> Result<Vec<String>, String> {
    stignore::read_ignore_file(&path)
}

#[tauri::command]
async fn list_files_local(path: String, prefix: String) -> Result<Vec<FileNode>, String> {
    use std::fs;
    use std::path::Path;

    let base = Path::new(&path);
    let target = if prefix.is_empty() {
        base.to_path_buf()
    } else {
        base.join(&prefix)
    };

    if !target.exists() {
        return Err(format!("Path does not exist: {:?}", target));
    }

    let mut entries = Vec::new();

    if let Ok(read_dir) = fs::read_dir(&target) {
        for entry in read_dir {
            if let Ok(entry) = entry {
                let filename = entry.file_name().to_string_lossy().to_string();
                
                // Construct relative path (name) to match Syncthing API behavior
                let relative_name = if prefix.is_empty() {
                    filename
                } else {
                    // Force forward slashes for consistency
                    format!("{}/{}", prefix.replace("\\", "/").trim_end_matches('/'), filename)
                };

                let metadata = entry.metadata().map_err(|e| e.to_string())?;
                let is_dir = metadata.is_dir();
                let size = if is_dir { 0 } else { metadata.len() as i64 };
                
                // Mod time string
                let mod_time = metadata.modified().ok().map(|_t| "unknown".to_string());

                entries.push(FileNode {
                    name: relative_name,
                    size: Some(size),
                    mod_time: mod_time,
                    file_type: Some(if is_dir { "directory".to_string() } else { "file".to_string() }),
                    children: None,
                });
            }
        }
    }

    // Sort: Directories first, then alphabetical
    entries.sort_by(|a, b| {
        let a_dir = a.file_type.as_deref() == Some("directory");
        let b_dir = b.file_type.as_deref() == Some("directory");
        if a_dir && !b_dir {
            std::cmp::Ordering::Less
        } else if !a_dir && b_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(entries)
}

#[tauri::command]
async fn open_path(path: String) -> Result<(), String> {
    open::that(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn scan_folder(config: SyncthingConfig, folder: String) -> Result<(), String> {
    syncthing::scan_folder(&config, &folder).await
}

#[tauri::command]
async fn get_folder_status(config: SyncthingConfig, folder: String) -> Result<syncthing::FolderStatus, String> {
    syncthing::get_folder_status(&config, &folder).await
}

#[tauri::command]
async fn load_startup_config() -> Result<Option<startup::StartupConfig>, String> {
    startup::read_startup_config()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(WatcherState::new())
        .invoke_handler(tauri::generate_handler![
            fetch_files,
            check_connection,
            get_folder_path,
            save_ignore,
            read_ignore,
            watcher::watch_folder,
            list_files_local,
            open_path,
            scan_folder,
            get_folder_status,
            load_startup_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
