use std::collections::HashSet;
use std::fs;
use std::path::Path;

pub fn read_ignore_file(path: &str) -> Result<Vec<String>, String> {
    if !Path::new(path).exists() {
        return Err(format!("File not found: {}", path));
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(content.lines().map(|s| s.to_string()).collect())
}

pub fn write_ignore_file(path: &str, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreItem {
    pub path: String,
    pub is_folder: bool,
    pub selected: bool, // Added to track whitelist vs blacklist
}

pub fn generate_stignore(items: Vec<IgnoreItem>) -> String {
    let mut lines = Vec::new();

    // 1. Identify Whitelist Items & Required Parents
    let mut whitelist_items: Vec<_> = items.iter().filter(|i| i.selected).collect();
    whitelist_items.sort_by(|a, b| a.path.cmp(&b.path));

    let mut required_parents = HashSet::new();
    for item in &whitelist_items {
        let path = if item.path.starts_with('/') { item.path.clone() } else { format!("/{}", item.path) };
        let mut current = path.clone();
        while let Some(last_slash) = current.rfind('/') {
            if last_slash == 0 { break; }
            current = current[..last_slash].to_string();
            // Store as clean absolute path
            required_parents.insert(current.clone());
        }
    }

    // 2. BLACKLIST Rules (Exceptions) - These must come FIRST
    // But we must NOT blacklist a folder if it is needed for traversal (i.e. is a required parent)
    let mut blacklist_items: Vec<_> = items.iter().filter(|i| !i.selected).collect();
    blacklist_items.sort_by(|a, b| a.path.cmp(&b.path));

    for item in blacklist_items {
        let path = &item.path;
        let clean_path = if path.starts_with('/') { path.clone() } else { format!("/{}", path) };
        
        // Skip if this path is required for visiting a child
        if required_parents.contains(&clean_path) {
            continue;
        }

        lines.push(format!("{}", clean_path));
    }

    // 3. WHITELIST Rules (Inclusions)
    let mut include_lines = HashSet::new();

    for item in whitelist_items {
        let path = &item.path;
        let clean_path = if path.starts_with('/') { path.clone() } else { format!("/{}", path) };

        // Add the item itself
        include_lines.insert(format!("!{}", clean_path));

        // If it's a folder, we also want to include its content recursively
        if item.is_folder {
            include_lines.insert(format!("!{}/**", clean_path));
        }

        // Add all parents to ensure traversal is allowed
        let mut current = clean_path.clone();
        while let Some(last_slash) = current.rfind('/') {
            if last_slash == 0 { break; }
            current = current[..last_slash].to_string();
            include_lines.insert(format!("!{}", current));
        }
    }

    // ... (rest is the same: sort includes, add *, join)

    let mut sorted_includes: Vec<String> = include_lines.into_iter().collect();
    sorted_includes.sort();

    lines.extend(sorted_includes);

    // 3. IGNORE ALL (Catch-all)
    lines.push("*".to_string());

    lines.join("\n")
}
