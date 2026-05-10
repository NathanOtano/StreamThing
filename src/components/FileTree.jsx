import { createSignal, For, Show, createEffect, onMount } from "solid-js";
import { fetchFiles, listFilesLocal } from "../services/api";
import { store, toggleSelection } from "../store";
import { matchesFilter } from "../utils/filterUtils";
import { entryPathForParent, normalizeTreeEntry, shouldHideSystemEntry } from "../utils/fileTreeUtils";
import { invoke } from "@tauri-apps/api/core";
import Folder from "lucide-solid/icons/folder";
import FolderOpen from "lucide-solid/icons/folder-open";
import File from "lucide-solid/icons/file";
import Check from "lucide-solid/icons/check";
import Monitor from "lucide-solid/icons/monitor";
import Cloud from "lucide-solid/icons/cloud";
import AlertCircle from "lucide-solid/icons/alert-circle";
import Video from "lucide-solid/icons/video";
import Image from "lucide-solid/icons/image";
import Music from "lucide-solid/icons/music";
import FileCode from "lucide-solid/icons/file-code";
import FileText from "lucide-solid/icons/file-text";

const FileTreeNode = (props) => {
    const [expanded, setExpanded] = createSignal(false);
    const [children, setChildren] = createSignal([]);
    const [loading, setLoading] = createSignal(false);

    onMount(() => {
        if (!props.parentPath) {
            setExpanded(true);
            fetchChildren();
        }
    });

    const fullPath = () => {
        if (props.node.path !== undefined) return props.node.path;
        return entryPathForParent(props.node.name, props.parentPath || "");
    };

    const isDirectory = () => props.node.type === "directory";
    const isRoot = () => !props.parentPath;

    const fetchChildren = async () => {
        setLoading(true);
        try {
            let prefix = fullPath();
            let remotePrefix = prefix;
            if (remotePrefix && !remotePrefix.endsWith("/")) remotePrefix += "/";

            const promises = [];
            if (store.config.apiKey && store.folderId) {
                promises.push(fetchFiles(store.config, store.folderId, remotePrefix).catch(err => []));
            } else {
                promises.push(Promise.resolve([]));
            }

            if (store.rootPath) {
                promises.push(listFilesLocal(store.rootPath, prefix).catch(err => []));
            } else {
                promises.push(Promise.resolve([]));
            }

            const [remoteFiles, localFiles] = await Promise.all(promises);

            const merged = new Map();
            const addEntry = (file, source) => {
                const entry = normalizeTreeEntry(file, prefix, source);
                if (!entry.path || entry.path === prefix || shouldHideSystemEntry(entry)) return;

                if (merged.has(entry.path)) {
                    const existing = merged.get(entry.path);
                    merged.set(entry.path, { ...existing, ...entry, _source: 'both' });
                    return;
                }

                merged.set(entry.path, entry);
            };

            remoteFiles.forEach(f => addEntry(f, 'remote'));
            localFiles.forEach(f => addEntry(f, 'local'));

            const mergedList = Array.from(merged.values());

            mergedList.sort((a, b) => {
                const aDir = a.type === "directory";
                const bDir = b.type === "directory";
                if (aDir && !bDir) return -1;
                if (!aDir && bDir) return 1;
                return a.name.localeCompare(b.name);
            });

            setChildren(mergedList);
        } catch (e) {
            console.error("Fetch error:", e);
        } finally {
            setLoading(false);
        }
    };

    createEffect(() => {
        store.filesVersion;
        if (expanded()) {
            fetchChildren();
        }
    });

    createEffect(() => {
        const change = store.lastChangedPath;
        if (expanded() && change && change.path === fullPath()) {
            fetchChildren();
        }
    });

    const toggleExpand = async () => {
        if (!isDirectory()) return;
        if (!expanded()) {
            if (children().length === 0) {
                await fetchChildren();
            }
        }
        setExpanded(!expanded());
    };

    const isSelected = () => {
        const path = fullPath();
        const explicit = store.selectedItems[path];
        if (explicit !== undefined) return explicit.selected;
        let parts = path.split('/');
        parts.pop();
        while (parts.length > 0) {
            const parentPath = parts.join('/');
            const parent = store.selectedItems[parentPath];
            if (parent && parent.selected && parent.isFolder) return true;
            if (parent && parent.selected === false) return false;
            parts.pop();
        }
        if (store.selectedItems[""] && store.selectedItems[""].isFolder && store.selectedItems[""].selected) return true;
        return false;
    };

    const isSavedSelected = () => {
        const path = fullPath();
        const explicit = store.savedSelectedItems[path];
        if (explicit !== undefined) return explicit.selected;
        let parts = path.split('/');
        parts.pop();
        while (parts.length > 0) {
            const parentPath = parts.join('/');
            const parent = store.savedSelectedItems[parentPath];
            if (parent && parent.selected && parent.isFolder) return true;
            if (parent && parent.selected === false) return false;
            parts.pop();
        }
        if (store.savedSelectedItems[""] && store.savedSelectedItems[""].isFolder && store.savedSelectedItems[""].selected) return true;
        return false;
    };

    const isDirty = () => isSelected() !== isSavedSelected();

    const displayName = () => {
        if (!props.node.name) {
            if (store.rootPath) {
                const parts = store.rootPath.replace(/\\/g, '/').split('/').filter(p => p);
                return parts[parts.length - 1] || store.rootPath;
            }
            return "Racine (" + store.folderId + ")";
        }
        return props.node.name;
    };

    const getStatus = () => {
        const selected = isSelected();
        const source = props.node._source || 'local'; // Default to local

        if (selected) return 'synced';

        if (source === 'local') return 'local';
        if (source === 'both') return 'both';
        return 'remote';
    };

    const getRowStyle = (status) => {
        if (status === 'synced') return "text-[#4a90e2] font-medium";
        if (status === 'local') return "text-[#e0e0e0]";
        if (status === 'both') return "text-[#f5a623]";
        return "text-[#888] italic";
    };

    const getStatusIcon = (status) => {
        if (status === 'synced') return <Check class="w-4 h-4 text-[#4a90e2]" />;
        if (status === 'local') return <Monitor class="w-4 h-4 text-[#e0e0e0]" />;
        if (status === 'both') return <AlertCircle class="w-4 h-4 text-[#f5a623]" />;
        return <Cloud class="w-4 h-4 text-[#888]" />;
    };

    const toggleSync = (e) => {
        e.stopPropagation();
        toggleSelection(fullPath(), isDirectory(), !isSelected());
    };

    const handleOpen = (e) => {
        e.stopPropagation();
        if (store.rootPath) {
            let path = store.rootPath;
            const sub = fullPath();
            if (sub) {
                path = path.replace(/\\/g, '/');
                if (!path.endsWith('/')) path += '/';
                path += sub;
            }
            invoke("open_path", { path }).catch(console.error);
        }
    };

    return (
        <div class={isRoot() ? "" : "ml-4"}>
            <div
                class={`flex items-center space-x-2 py-1 px-2 rounded-sm group transition-colors border border-transparent hover:bg-[#333] cursor-pointer`}
                onClick={toggleSync}
            >
                <Show when={!isDirectory() && !isRoot()}>
                    <div class="w-4"></div>
                </Show>

                <div
                    class="flex items-center hover:opacity-80 active:scale-95 transition-transform mr-1"
                    title="Activer ou exclure de la synchronisation"
                >
                    <div class="w-3 h-4 flex items-center justify-center relative mr-1">
                        <Show when={isDirty()}>
                            <div class="w-1.5 h-1.5 rounded-full bg-orange-500 absolute z-10"></div>
                        </Show>
                        <Show when={loading()}>
                            <div class="w-3 h-3 rounded-full border border-t-transparent border-[#888] animate-spin absolute z-0"></div>
                        </Show>
                    </div>

                    <div class="flex items-center justify-center">
                        {getStatusIcon(getStatus())}
                    </div>
                </div>

                <div
                    class={`flex items-center justify-center ${isDirectory() ? "cursor-pointer hover:scale-110 transition-transform" : ""}`}
                    onClick={(e) => {
                        if (isDirectory()) {
                            e.stopPropagation();
                            toggleExpand();
                        }
                    }}
                >
                    {(() => {
                        if (isDirectory()) {
                            return expanded()
                                ? <FolderOpen class="w-4 h-4 text-yellow-500" />
                                : <Folder class="w-4 h-4 text-yellow-500" />;
                        }
                        const name = props.node.name.toLowerCase();
                        const ext = name.split('.').pop();

                        if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv'].includes(ext)) {
                            return <Video class="w-4 h-4 text-purple-400" />;
                        }
                        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'].includes(ext)) {
                            return <Image class="w-4 h-4 text-green-400" />;
                        }
                        if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(ext)) {
                            return <Music class="w-4 h-4 text-pink-400" />;
                        }
                        if (['js', 'jsx', 'ts', 'tsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'cs', 'rb', 'php', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'toml'].includes(ext)) {
                            return <FileCode class="w-4 h-4 text-blue-400" />;
                        }
                        if (['txt', 'md', 'log', 'csv', 'doc', 'docx', 'pdf', 'rtf'].includes(ext)) {
                            return <FileText class="w-4 h-4 text-orange-300" />;
                        }
                        return <File class="w-4 h-4 text-gray-400" />;
                    })()}
                </div>

                <span
                    class={`select-none truncate cursor-pointer hover:underline ${getRowStyle(getStatus())}`}
                    onClick={(e) => { e.stopPropagation(); handleOpen(e); }}
                    title="Ouvrir le fichier ou le dossier"
                >
                    {displayName()}
                </span>

                <div class="flex-1"></div>

                <Show when={props.node.size !== undefined && !isDirectory()}>
                    <span class="text-xs text-[#555] ml-2 font-mono">
                        {(props.node.size / 1024).toFixed(1)} Ko
                    </span>
                </Show>
            </div>

            <Show when={expanded()}>
                <div class="border-l border-[#333] ml-2.5">
                    <For each={children()}>
                        {(child) => (
                            <Show when={!props.filters || matchesFilter(child, fullPath(), props.filters)}>
                                <FileTreeNode
                                    node={child}
                                    parentPath={fullPath()}
                                    filters={props.filters}
                                />
                            </Show>
                        )}
                    </For>
                </div>
            </Show>
        </div>
    );
};

export default FileTreeNode;
