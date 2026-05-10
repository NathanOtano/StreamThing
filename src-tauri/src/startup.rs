use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::syncthing::SyncthingConfig;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupConfig {
    pub config: SyncthingConfig,
    pub folder_id: String,
    pub local_path: String,
    pub label: Option<String>,
    pub source: Option<String>,
    pub created_at: Option<String>,
}

fn startup_config_path() -> Result<PathBuf, String> {
    let local_app_data = std::env::var_os("LOCALAPPDATA")
        .ok_or_else(|| "LOCALAPPDATA is not defined".to_string())?;

    Ok(PathBuf::from(local_app_data)
        .join("io.streamthing.desktop")
        .join("startup-config.json"))
}

pub fn read_startup_config() -> Result<Option<StartupConfig>, String> {
    let path = startup_config_path()?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read startup config: {}", e))?;
    let config = serde_json::from_str::<StartupConfig>(&content)
        .map_err(|e| format!("Invalid startup config: {}", e))?;

    fs::remove_file(&path)
        .map_err(|e| format!("Failed to consume startup config: {}", e))?;

    Ok(Some(config))
}
