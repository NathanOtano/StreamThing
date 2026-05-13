use reqwest::blocking::Client;
use roxmltree::Document;
use serde::Serialize;
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const APP_DIR_NAME: &str = "io.streamthing.desktop";
const APP_EXE_NAMES: &[&str] = &["streamthing-desktop.exe", "streamthing.exe", "StreamThing.exe"];

#[derive(Debug)]
struct CliArgs {
    command: String,
    device: Option<String>,
    folder_id: Option<String>,
    syncthing_home: Option<PathBuf>,
    exe_path: Option<PathBuf>,
    only_active: bool,
    allow_paused: bool,
    scan: bool,
    stop_existing: bool,
    json: bool,
    help: bool,
    version: bool,
}

impl Default for CliArgs {
    fn default() -> Self {
        Self {
            command: "list-folders".to_string(),
            device: None,
            folder_id: None,
            syncthing_home: None,
            exe_path: None,
            only_active: false,
            allow_paused: false,
            scan: false,
            stop_existing: false,
            json: false,
            help: false,
            version: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
struct Device {
    id: String,
    name: String,
    addresses: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "PascalCase")]
struct Folder {
    id: String,
    label: String,
    path: String,
    paused: bool,
    devices: Vec<String>,
    #[serde(skip)]
    device_ids: Vec<String>,
    #[serde(rename = "SharedWithDevice")]
    shared_with_device: bool,
}

#[derive(Debug)]
struct SyncthingLocalConfig {
    url: String,
    api_key: String,
    devices: Vec<Device>,
    folders: Vec<Folder>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiConfig<'a> {
    url: &'a str,
    api_key: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupConfig<'a> {
    config: ApiConfig<'a>,
    folder_id: &'a str,
    local_path: &'a str,
    label: &'a str,
    source: &'a str,
    device: Option<&'a str>,
    created_at: String,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = parse_args(env::args().skip(1))?;

    if args.help {
        print_help();
        return Ok(());
    }

    if args.version {
        println!("streamthing-cli {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

    let syncthing = read_syncthing_config(args.syncthing_home.as_deref())?;
    let target_device = resolve_device(&syncthing.devices, args.device.as_deref())?;
    let folders = folders_with_scope(&syncthing.folders, target_device.as_ref());

    match args.command.as_str() {
        "list-folders" => {
            let mut visible: Vec<Folder> = folders;
            if args.only_active {
                visible.retain(|folder| !folder.paused);
            }
            if args.json {
                print_json(&serde_json::json!({
                    "Device": target_device.as_ref().map(|device| device.name.as_str()),
                    "Url": syncthing.url,
                    "Folders": visible,
                }))?;
            } else {
                println!("Syncthing: {}", syncthing.url);
                if let Some(device) = target_device.as_ref() {
                    println!("Device: {}", device.name);
                }
                for folder in visible {
                    let state = if folder.paused { "paused" } else { "active" };
                    println!("{} | {} | {} | {}", folder.id, folder.label, state, folder.path);
                }
            }
        }
        "status" => {
            let folder = select_folder(&folders, args.folder_id.as_deref(), false, args.allow_paused)?;
            let status = get_folder_status(&syncthing, &folder.id)?;
            if args.json {
                print_json(&serde_json::json!({
                    "Device": target_device.as_ref().map(|device| device.name.as_str()),
                    "Folder": folder,
                    "State": status.get("state").and_then(|value| value.as_str()),
                    "LocalFiles": status.get("localFiles"),
                    "GlobalFiles": status.get("globalFiles"),
                    "NeedFiles": status.get("needFiles"),
                    "NeedBytes": status.get("needBytes"),
                }))?;
            } else {
                println!("Folder: {} ({})", folder.id, folder.label);
                println!("Path: {}", folder.path);
                println!("Paused: {}", folder.paused);
                if let Some(state) = status.get("state").and_then(|value| value.as_str()) {
                    println!("State: {state}");
                }
                if let Some(need_files) = status.get("needFiles") {
                    println!("NeedFiles: {need_files}");
                }
                if let Some(need_bytes) = status.get("needBytes") {
                    println!("NeedBytes: {need_bytes}");
                }
            }
        }
        "configure" => {
            let require_active = args.folder_id.is_none();
            let folder = select_folder(&folders, args.folder_id.as_deref(), require_active, args.allow_paused)?;
            let startup_path = write_startup_config(&syncthing, &folder, target_device.as_ref())?;
            if args.json {
                print_json(&serde_json::json!({
                    "Configured": true,
                    "StartupConfigPath": startup_path,
                    "Folder": folder,
                    "Device": target_device.as_ref().map(|device| device.name.as_str()),
                }))?;
            } else {
                println!("Configured: {}", folder.id);
                println!("StartupConfigPath: {}", startup_path.display());
            }
        }
        "scan" => {
            let folder = select_folder(&folders, args.folder_id.as_deref(), true, args.allow_paused)?;
            request_scan(&syncthing, &folder.id)?;
            if args.json {
                print_json(&serde_json::json!({
                    "ScanRequested": true,
                    "Folder": folder,
                }))?;
            } else {
                println!("Scan requested: {}", folder.id);
            }
        }
        "launch" => {
            let require_active = args.folder_id.is_none();
            let folder = select_folder(&folders, args.folder_id.as_deref(), require_active, args.allow_paused)?;
            if args.scan {
                request_scan(&syncthing, &folder.id)?;
            }
            if streamthing_is_running()? {
                if args.stop_existing {
                    stop_streamthing()?;
                    std::thread::sleep(Duration::from_millis(600));
                } else {
                    return Err(format!(
                        "StreamThing is already running. Re-run with -StopExisting to relaunch on '{}'.",
                        folder.id
                    ));
                }
            }

            let startup_path = write_startup_config(&syncthing, &folder, target_device.as_ref())?;
            let exe_path = resolve_app_exe(args.exe_path.as_deref())?;
            let mut command = Command::new(&exe_path);
            if let Some(parent) = exe_path.parent() {
                command.current_dir(parent);
            }
            let child = command.spawn().map_err(|err| format!("Failed to launch StreamThing: {err}"))?;

            if args.json {
                print_json(&serde_json::json!({
                    "Launched": true,
                    "ProcessId": child.id(),
                    "Executable": exe_path,
                    "StartupConfigPath": startup_path,
                    "ScanRequested": args.scan,
                    "Folder": folder,
                    "Device": target_device.as_ref().map(|device| device.name.as_str()),
                }))?;
            } else {
                println!("Launched: {}", exe_path.display());
                println!("ProcessId: {}", child.id());
                println!("Folder: {}", folder.id);
                println!("StartupConfigPath: {}", startup_path.display());
            }
        }
        other => return Err(format!("Unknown command: {other}")),
    }

    Ok(())
}

fn parse_args<I>(values: I) -> Result<CliArgs, String>
where
    I: IntoIterator<Item = String>,
{
    let mut args = CliArgs::default();
    let mut iter = values.into_iter().peekable();

    while let Some(value) = iter.next() {
        if value == "-h" || value == "--help" || value == "help" {
            args.help = true;
            continue;
        }
        if value == "-v" || value == "--version" || value == "version" {
            args.version = true;
            continue;
        }

        if !value.starts_with('-') {
            args.command = value;
            continue;
        }

        let key = value.trim_start_matches('-').to_ascii_lowercase();
        match key.as_str() {
            "device" => args.device = Some(next_value(&mut iter, &value)?),
            "folderid" | "folder-id" | "folder" => args.folder_id = Some(next_value(&mut iter, &value)?),
            "syncthinghome" | "syncthing-home" => {
                args.syncthing_home = Some(PathBuf::from(next_value(&mut iter, &value)?));
            }
            "exepath" | "exe-path" => {
                args.exe_path = Some(PathBuf::from(next_value(&mut iter, &value)?));
            }
            "onlyactive" | "only-active" => args.only_active = true,
            "allowpaused" | "allow-paused" => args.allow_paused = true,
            "scan" => args.scan = true,
            "stopexisting" | "stop-existing" => args.stop_existing = true,
            "json" => args.json = true,
            _ => return Err(format!("Unknown option: {value}")),
        }
    }

    Ok(args)
}

fn next_value<I>(iter: &mut std::iter::Peekable<I>, option: &str) -> Result<String, String>
where
    I: Iterator<Item = String>,
{
    iter.next()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("Missing value after {option}"))
}

fn print_help() {
    println!(
        "StreamThing CLI\n\nCommands:\n  list-folders\n  status\n  configure\n  launch\n  scan\n\nOptions:\n  --device, -Device <name>               Restrict folders to one Syncthing device\n  --folder-id, -FolderId <id>            Select one Syncthing folder\n  --only-active, -OnlyActive             Hide paused folders when listing\n  --allow-paused, -AllowPaused           Permit actions on paused folders\n  --scan, -Scan                          Request a Syncthing scan during launch\n  --stop-existing, -StopExisting         Close an existing StreamThing app before launch\n  --json, -Json                          Print machine-readable JSON\n  --syncthing-home, -SyncthingHome <path> Use a custom Syncthing config directory\n  --exe-path, -ExePath <path>            Use a custom StreamThing executable path\n  --version                              Print CLI version\n"
    );
}

fn normalize_token(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn syncthing_config_path(syncthing_home: Option<&Path>) -> Result<PathBuf, String> {
    if let Some(home) = syncthing_home {
        return Ok(home.join("config.xml"));
    }

    let local_app_data = env::var_os("LOCALAPPDATA")
        .ok_or_else(|| "LOCALAPPDATA is not defined".to_string())?;
    Ok(PathBuf::from(local_app_data).join("Syncthing").join("config.xml"))
}

fn read_syncthing_config(syncthing_home: Option<&Path>) -> Result<SyncthingLocalConfig, String> {
    let path = syncthing_config_path(syncthing_home)?;
    let content = fs::read_to_string(&path)
        .map_err(|err| format!("Syncthing config not found or unreadable at {}: {err}", path.display()))?;
    let doc = Document::parse(&content)
        .map_err(|err| format!("Invalid Syncthing config XML at {}: {err}", path.display()))?;
    let root = doc
        .descendants()
        .find(|node| node.has_tag_name("configuration"))
        .ok_or_else(|| "Syncthing config is missing <configuration>".to_string())?;
    let gui = root
        .children()
        .find(|node| node.has_tag_name("gui"))
        .ok_or_else(|| "Syncthing config is missing <gui>".to_string())?;

    let address = child_text(gui, "address")
        .ok_or_else(|| "Syncthing GUI address is missing from config.xml".to_string())?;
    let api_key = child_text(gui, "apikey")
        .ok_or_else(|| "Syncthing API key is missing from config.xml".to_string())?;

    let devices: Vec<Device> = root
        .children()
        .filter(|node| node.has_tag_name("device"))
        .map(|node| Device {
            id: node.attribute("id").unwrap_or_default().to_string(),
            name: node.attribute("name").unwrap_or_default().to_string(),
            addresses: node
                .children()
                .filter(|child| child.has_tag_name("address"))
                .filter_map(|child| child.text().map(|text| text.to_string()))
                .collect(),
        })
        .filter(|device| !device.id.is_empty())
        .collect();

    let device_names: HashMap<String, String> = devices
        .iter()
        .map(|device| (device.id.clone(), device.name.clone()))
        .collect();

    let folders: Vec<Folder> = root
        .children()
        .filter(|node| node.has_tag_name("folder"))
        .map(|node| {
            let device_ids: Vec<String> = node
                .children()
                .filter(|child| child.has_tag_name("device"))
                .filter_map(|child| child.attribute("id").map(|id| id.to_string()))
                .collect();
            let devices = device_ids
                .iter()
                .filter_map(|id| device_names.get(id).cloned())
                .collect();
            let id = node.attribute("id").unwrap_or_default().to_string();
            let label = node
                .attribute("label")
                .filter(|value| !value.is_empty())
                .unwrap_or(id.as_str())
                .to_string();
            Folder {
                id,
                label,
                path: resolve_folder_path(node.attribute("path").unwrap_or_default()),
                paused: node.attribute("paused").unwrap_or("false").eq_ignore_ascii_case("true"),
                devices,
                device_ids,
                shared_with_device: true,
            }
        })
        .filter(|folder| !folder.id.is_empty())
        .collect();

    Ok(SyncthingLocalConfig {
        url: gui_url(&address),
        api_key,
        devices,
        folders,
    })
}

fn child_text(node: roxmltree::Node<'_, '_>, name: &str) -> Option<String> {
    node.children()
        .find(|child| child.has_tag_name(name))
        .and_then(|child| child.text())
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn gui_url(address: &str) -> String {
    if address.starts_with("http://") || address.starts_with("https://") {
        address.to_string()
    } else {
        format!("http://{address}")
    }
}

fn resolve_folder_path(path: &str) -> String {
    if let Some(stripped) = path.strip_prefix('~') {
        if let Some(home) = env::var_os("USERPROFILE") {
            return PathBuf::from(home)
                .join(stripped.trim_start_matches(['\\', '/']))
                .to_string_lossy()
                .to_string();
        }
    }
    path.to_string()
}

fn resolve_device(devices: &[Device], name: Option<&str>) -> Result<Option<Device>, String> {
    let Some(name) = name.filter(|name| !name.is_empty()) else {
        return Ok(None);
    };
    let target = normalize_token(name);
    let found = devices.iter().find(|device| {
        let normalized_name = normalize_token(&device.name);
        let normalized_id = normalize_token(&device.id);
        normalized_name == target || normalized_name.contains(&target) || normalized_id.starts_with(&target)
    });

    found
        .cloned()
        .map(Some)
        .ok_or_else(|| format!("Device not found in Syncthing config: {name}"))
}

fn folders_with_scope(folders: &[Folder], target_device: Option<&Device>) -> Vec<Folder> {
    folders
        .iter()
        .cloned()
        .map(|mut folder| {
            folder.shared_with_device = target_device
                .map(|device| folder.device_ids.iter().any(|id| id == &device.id))
                .unwrap_or(true);
            folder
        })
        .filter(|folder| folder.shared_with_device)
        .collect()
}

fn select_folder(
    folders: &[Folder],
    requested_folder_id: Option<&str>,
    require_active: bool,
    allow_paused: bool,
) -> Result<Folder, String> {
    let mut candidates: Vec<Folder> = folders
        .iter()
        .filter(|folder| {
            requested_folder_id
                .map(|requested| folder.id == requested || folder.label == requested)
                .unwrap_or(true)
        })
        .filter(|folder| !require_active || allow_paused || !folder.paused)
        .cloned()
        .collect();

    candidates.sort_by(|a, b| {
        a.paused
            .cmp(&b.paused)
            .then_with(|| a.label.cmp(&b.label))
            .then_with(|| a.id.cmp(&b.id))
    });

    let selected = candidates.into_iter().next().ok_or_else(|| {
        if let Some(requested) = requested_folder_id {
            format!("No matching Syncthing folder for {requested}. Use -AllowPaused if you intentionally want a paused folder.")
        } else {
            "No matching Syncthing folder. Use -AllowPaused if you intentionally want a paused folder.".to_string()
        }
    })?;

    if selected.paused && !allow_paused {
        return Err(format!(
            "Folder '{}' is paused. Use -AllowPaused if this is intentional.",
            selected.id
        ));
    }

    Ok(selected)
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|err| format!("Failed to create HTTP client: {err}"))
}

fn get_folder_status(config: &SyncthingLocalConfig, folder_id: &str) -> Result<serde_json::Value, String> {
    let response = client()?
        .get(format!("{}/rest/db/status", config.url))
        .header("X-API-Key", &config.api_key)
        .query(&[("folder", folder_id)])
        .send()
        .map_err(|err| format!("Syncthing status request failed: {err}"))?;

    if !response.status().is_success() {
        return Err(format!("Syncthing status request failed: {}", response.status()));
    }

    response
        .json::<serde_json::Value>()
        .map_err(|err| format!("Invalid Syncthing status response: {err}"))
}

fn request_scan(config: &SyncthingLocalConfig, folder_id: &str) -> Result<(), String> {
    let response = client()?
        .post(format!("{}/rest/db/scan", config.url))
        .header("X-API-Key", &config.api_key)
        .query(&[("folder", folder_id)])
        .send()
        .map_err(|err| format!("Syncthing scan request failed: {err}"))?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("Syncthing scan request failed: {}", response.status()))
    }
}

fn app_data_dir() -> Result<PathBuf, String> {
    let local_app_data = env::var_os("LOCALAPPDATA")
        .ok_or_else(|| "LOCALAPPDATA is not defined".to_string())?;
    Ok(PathBuf::from(local_app_data).join(APP_DIR_NAME))
}

fn write_startup_config(
    syncthing: &SyncthingLocalConfig,
    folder: &Folder,
    target_device: Option<&Device>,
) -> Result<PathBuf, String> {
    let app_dir = app_data_dir()?;
    fs::create_dir_all(&app_dir)
        .map_err(|err| format!("Failed to create app data directory {}: {err}", app_dir.display()))?;
    let path = app_dir.join("startup-config.json");
    let payload = StartupConfig {
        config: ApiConfig {
            url: &syncthing.url,
            api_key: &syncthing.api_key,
        },
        folder_id: &folder.id,
        local_path: &folder.path,
        label: &folder.label,
        source: "streamthing-cli",
        device: target_device.map(|device| device.name.as_str()),
        created_at: unix_timestamp_string(),
    };
    let json = serde_json::to_string_pretty(&payload)
        .map_err(|err| format!("Failed to encode startup config: {err}"))?;
    fs::write(&path, json)
        .map_err(|err| format!("Failed to write startup config {}: {err}", path.display()))?;
    Ok(path)
}

fn unix_timestamp_string() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("{seconds}")
}

fn resolve_app_exe(explicit: Option<&Path>) -> Result<PathBuf, String> {
    if let Some(path) = explicit {
        return path
            .canonicalize()
            .map_err(|err| format!("StreamThing executable not found at {}: {err}", path.display()));
    }

    let cli_path = env::current_exe().map_err(|err| format!("Failed to resolve current CLI path: {err}"))?;
    let mut search_dirs = Vec::new();
    if let Some(parent) = cli_path.parent() {
        search_dirs.push(parent.to_path_buf());
        if let Some(grandparent) = parent.parent() {
            search_dirs.push(grandparent.to_path_buf());
        }
    }

    for dir in search_dirs {
        for exe_name in APP_EXE_NAMES {
            let candidate = dir.join(exe_name);
            if candidate.exists() {
                return candidate
                    .canonicalize()
                    .map_err(|err| format!("Failed to resolve {}: {err}", candidate.display()));
            }
        }
    }

    Err("StreamThing executable not found next to the CLI. Use -ExePath <path>.".to_string())
}

fn streamthing_is_running() -> Result<bool, String> {
    for exe_name in APP_EXE_NAMES {
        let filter = format!("IMAGENAME eq {exe_name}");
        let output = Command::new("tasklist")
            .args(["/FI", filter.as_str(), "/NH"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|err| format!("Failed to run tasklist: {err}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
        if stdout.contains(&exe_name.to_ascii_lowercase()) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn stop_streamthing() -> Result<(), String> {
    for exe_name in APP_EXE_NAMES {
        let filter = format!("IMAGENAME eq {exe_name}");
        let output = Command::new("tasklist")
            .args(["/FI", filter.as_str(), "/NH"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|err| format!("Failed to run tasklist: {err}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
        if !stdout.contains(&exe_name.to_ascii_lowercase()) {
            continue;
        }

        let status = Command::new("taskkill")
            .args(["/IM", exe_name, "/F"])
            .status()
            .map_err(|err| format!("Failed to run taskkill: {err}"))?;
        if !status.success() {
            return Err(format!("taskkill exited with {status} for {exe_name}"));
        }
    }
    Ok(())
}

fn print_json<T: Serialize>(value: &T) -> Result<(), String> {
    let json = serde_json::to_string_pretty(value)
        .map_err(|err| format!("Failed to encode JSON output: {err}"))?;
    println!("{json}");
    Ok(())
}
