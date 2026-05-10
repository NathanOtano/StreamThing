use serde::{Deserialize, Serialize};
use reqwest;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub size: Option<i64>,
    #[serde(rename = "modTime")]
    pub mod_time: Option<String>,
    #[serde(rename = "type")]
    pub file_type: Option<String>, // "file" or "directory"
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncthingConfig {
    pub url: String,
    pub api_key: String,
}

pub async fn get_folder_tree(config: &SyncthingConfig, folder_id: &str, prefix: &str) -> Result<Vec<FileNode>, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/rest/db/browse", config.url);
    
    let response = client.get(&url)
        .header("X-API-Key", &config.api_key)
        .query(&[("folder", folder_id), ("prefix", prefix), ("levels", "1")])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Request failed: {}", response.status()));
    }

    // The response from db/browse is a JSON array of file objects
    let tree: Vec<FileNode> = response.json().await.map_err(|e| e.to_string())?;
    Ok(tree)
}

pub async fn check_connection(config: &SyncthingConfig) -> Result<bool, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/rest/system/ping", config.url);
    
    let response = client.get(&url)
        .header("X-API-Key", &config.api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(response.status().is_success())
}

/// Fetch the local folder path from Syncthing's folder configuration
pub async fn get_folder_path(config: &SyncthingConfig, folder_id: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/rest/config/folders/{}", config.url, folder_id);
    
    let response = client.get(&url)
        .header("X-API-Key", &config.api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Failed to fetch folder config: {}", response.status()));
    }

    #[derive(Deserialize)]
    struct FolderConfig {
        path: String,
    }

    let config: FolderConfig = response.json().await.map_err(|e| e.to_string())?;
    Ok(config.path)
}

pub async fn scan_folder(config: &SyncthingConfig, folder_id: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!("{}/rest/db/scan", config.url);

    let response = client.post(&url)
        .header("X-API-Key", &config.api_key)
        .query(&[("folder", folder_id)])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Scan failed: {}", response.status()));
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FolderStatus {
    pub state: String, // "idle", "scanning", "syncing", etc.
    pub errors: Option<i32>,
    #[serde(rename = "pullErrors")]
    pub pull_errors: Option<i32>,
}

pub async fn get_folder_status(config: &SyncthingConfig, folder_id: &str) -> Result<FolderStatus, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/rest/db/status", config.url);

    let response = client.get(&url)
        .header("X-API-Key", &config.api_key)
        .query(&[("folder", folder_id)])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Status fetch failed: {}", response.status()));
    }

    let status: FolderStatus = response.json().await.map_err(|e| e.to_string())?;
    Ok(status)
}
