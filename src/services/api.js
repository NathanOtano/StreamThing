import { invoke } from "@tauri-apps/api/core";
import { normalizeEntryType } from "../utils/fileTreeUtils";


export const fetchFiles = async (config, folderId, prefix) => {
    return await invoke("fetch_files", { config, folderId, prefix });
};

export const checkConnection = async (config) => {
    return await invoke("check_connection", { config });
};

export const getFolderPath = async (config, folderId) => {
    return await invoke("get_folder_path", { config, folderId });
};

export const saveIgnore = async (path, items) => {
    return await invoke("save_ignore", { path, items });
};

export const scanFolder = async (config, folderId) => {
    return await invoke("scan_folder", { config, folder: folderId });
};

export const getFolderStatus = async (config, folderId) => {
    return await invoke("get_folder_status", { config, folder: folderId });
};

export const loadStartupConfig = async () => {
    return await invoke("load_startup_config");
};

export const readIgnore = async (path) => {
    return await invoke("read_ignore", { path });
};

export const listFilesLocal = async (basePath, subPath = "") => {
    try {
        const files = await invoke("list_files_local", { path: basePath, prefix: subPath });
        // Response is already FileNode format from Rust
        // Fields can vary by command serializer: type, fileType, or file_type.
        return files.map(f => ({
            name: f.name,
            type: normalizeEntryType(f.type ?? f.fileType ?? f.file_type) || "file",
            size: f.size,
            modTime: f.modTime,
        }));
    } catch (error) {
        console.error("Local List Error:", error);
        return [];
    }
};
