import { createSignal, createEffect, onCleanup, onMount, Show } from "solid-js";
import { store, setStore } from "./store";
import Settings from "./components/Settings";
import Modal from "./components/Modal";
import FileTreeNode from "./components/FileTree";
import FilterPanel from "./components/FilterPanel";
import { saveIgnore, readIgnore, getFolderPath, scanFolder, getFolderStatus, loadStartupConfig } from "./services/api";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import SettingsIcon from "lucide-solid/icons/settings";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import SaveIcon from "lucide-solid/icons/save";

const FOLDER_STATUS_LABELS = {
  idle: "au repos",
  scanning: "analyse",
  syncing: "synchro",
  unknown: "inconnu",
};

const normalizeDesktopPath = (path = "") => String(path || "").replace(/\\/g, "/");

const dirnameFromPath = (path) => {
  const normalized = normalizeDesktopPath(path).replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return normalized;
  return normalized.slice(0, index);
};

const normalizeLocalFolderPath = (path) => {
  if (!path) return "";
  return normalizeDesktopPath(path).endsWith("/.stignore") ? dirnameFromPath(path) : path;
};

const isTauriRuntime = () => typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

const formatFolderStatus = (status) => FOLDER_STATUS_LABELS[status] || status || "inconnu";

const toHistoryEntry = (entry) => ({
  config: { ...entry.config },
  folderId: entry.folderId,
  localPath: normalizeLocalFolderPath(entry.localPath || ""),
  timestamp: entry.timestamp || Date.now(),
  name: entry.name || `${entry.label || entry.folderId} (${entry.config.url})`,
});

function App() {
  const [saving, setSaving] = createSignal(false);
  const [msg, setMsg] = createSignal("");
  const [showSettings, setShowSettings] = createSignal(false);
  const [folderStatus, setFolderStatus] = createSignal("unknown");

  const [loading, setLoading] = createSignal(true);

  const [filters, setFilters] = createSignal({
    startsWith: "",
    contains: "",
    endsWith: "",
    inFolder: "",
    extension: ""
  });

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      startsWith: "",
      contains: "",
      endsWith: "",
      inFolder: "",
      extension: ""
    });
  };

  const applyConfigEntry = (entry) => {
    const normalized = toHistoryEntry(entry);
    setStore("config", "url", normalized.config.url);
    setStore("config", "apiKey", normalized.config.apiKey);
    setStore("folderId", normalized.folderId);
    setStore("localPath", normalized.localPath);
    return normalized;
  };

  const saveConfigHistory = (entry) => {
    const normalized = toHistoryEntry(entry);
    try {
      let hist = JSON.parse(localStorage.getItem("configHistory") || "[]");
      hist = hist.filter(h => !(h.folderId === normalized.folderId && h.config.url === normalized.config.url));
      hist.unshift(normalized);
      localStorage.setItem("configHistory", JSON.stringify(hist.slice(0, 5)));
    } catch (e) {
      console.error("Failed to save history:", e);
    }
  };

  onMount(async () => {
    let loadedFromStartup = false;

    if (isTauriRuntime()) {
      try {
        const startupConfig = await loadStartupConfig();
        if (startupConfig) {
          const normalized = applyConfigEntry(startupConfig);
          saveConfigHistory(normalized);
          setMsg(`Configuration chargée : ${normalized.folderId}`);
          loadedFromStartup = true;
        }
      } catch (e) {
        console.error("Failed to load startup config:", e);
      }
    }

    try {
      const hist = JSON.parse(localStorage.getItem("configHistory") || "[]");
      if (!loadedFromStartup && hist.length > 0) {
        const entry = hist[0];
        applyConfigEntry(entry);
      }
    } catch (e) {
      console.error("Failed to load history:", e);
    }

    setTimeout(() => setLoading(false), 500);

    setTimeout(() => {
      if (!store.config.apiKey) {
        setShowSettings(true);
      }
    }, 100);
  });

  let isCreatingIgnore = false;

  const getStignorePath = (folderPath) => {
    if (!folderPath) return "";
    if (folderPath.endsWith(".stignore")) return folderPath;
    return folderPath + (folderPath.includes("\\") ? "\\.stignore" : "/.stignore");
  };

  const tryReadIgnore = async (stignorePath) => {
    try {
      const lines = await readIgnore(stignorePath);
      return lines;
    } catch {
      return null;
    }
  };

  const parseIgnoreLines = (lines) => {
    const selected = {};
    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      if (line === "*") return;

      if (line.startsWith("!")) {
        let isFolder = false;
        let path = line.substring(1);
        if (path.endsWith("/**")) {
          isFolder = true;
          path = path.substring(0, path.length - 3);
        }
        if (path.startsWith("/")) path = path.substring(1);
        if (path && path !== "") {
          if (selected[path]) {
            if (isFolder) selected[path].isFolder = true;
            selected[path].selected = true;
          } else {
            selected[path] = { path, isFolder, selected: true };
          }
        }
      } else {
        let path = line;
        if (path.startsWith("/")) path = path.substring(1);
        if (path !== "") {
          selected[path] = { path, isFolder: false, selected: false };
        }
      }
    });
    return selected;
  };

  const loadIgnore = async (onlyRead = false) => {
    if (isCreatingIgnore) return;
    setStore("stignoreWarning", "");

    if (store.localPath) {
      const localFolder = normalizeLocalFolderPath(store.localPath);
      const stignorePath = getStignorePath(localFolder);
      const lines = await tryReadIgnore(stignorePath);
      if (lines !== null) {
        const selected = parseIgnoreLines(lines);
        setStore("localPath", localFolder);
        setStore("selectedItems", selected);
        setStore("savedSelectedItems", JSON.parse(JSON.stringify(selected)));
        return;
      }
    }

    if (store.rootPath) {
      const rootFolder = normalizeLocalFolderPath(store.rootPath);
      const stignorePath = getStignorePath(rootFolder);
      const lines = await tryReadIgnore(stignorePath);
      if (lines !== null) {
        if (!store.localPath) {
          setStore("localPath", rootFolder);
        } else {
          setStore("stignoreWarning", ".stignore introuvable au chemin configuré, utilisation du dossier racine.");
        }
        const selected = parseIgnoreLines(lines);
        setStore("selectedItems", selected);
        setStore("savedSelectedItems", JSON.parse(JSON.stringify(selected)));
        return;
      }

      if (!onlyRead) {
        isCreatingIgnore = true;
        try {
          await saveIgnore(stignorePath, []);
          setStore("localPath", rootFolder);
          setStore("stignoreWarning", ".stignore créé dans le dossier racine.");
          setStore("selectedItems", {});
          setStore("savedSelectedItems", {});
        } catch (e) {
          console.error("Création .stignore impossible :", e);
        } finally {
          setTimeout(() => { isCreatingIgnore = false; }, 1000);
        }
      } else {
        setStore("selectedItems", {});
        setStore("savedSelectedItems", {});
      }
    }
  };

  createEffect(() => {
    let timeout;
    const poll = async () => {
      if (store.config.apiKey && store.folderId) {
        try {
          const status = await getFolderStatus(store.config, store.folderId);
          setFolderStatus(status.state);
        } catch (e) {
          setFolderStatus("unknown");
        }
      }
      timeout = setTimeout(poll, 3000);
    };
    poll();
    onCleanup(() => clearTimeout(timeout));
  });

  createEffect(async () => {
    if (store.config.apiKey && store.folderId) {
      try {
        const path = await getFolderPath(store.config, store.folderId);
        setStore("rootPath", path);
      } catch (e) {
        console.error("Lecture du dossier Syncthing impossible :", e);
        setStore("rootPath", "");
      }
    }
  });

  createEffect(() => {
    if (store.rootPath) {
      invoke("watch_folder", { path: store.rootPath }).catch(console.error);
      loadIgnore();
    }
  });

  onMount(() => {
    if (!isTauriRuntime()) return;

    const unlistenPromise = listen("fs-change", (event) => {
      const paths = event.payload.paths || [];
      const root = normalizeDesktopPath(store.rootPath);
      const rootPrefix = root.endsWith("/") ? root : `${root}/`;
      let ignoreChanged = false;
      let nonIgnoreChange = false;

      paths.forEach(absPath => {
        const normalizedAbs = normalizeDesktopPath(absPath);
        if (normalizedAbs.endsWith("/.stignore")) {
          ignoreChanged = true;
          return;
        }

        if (root && (normalizedAbs === root || normalizedAbs.startsWith(rootPrefix))) {
          const rel = normalizedAbs.slice(root.length).replace(/^\/+/, "");
          if (rel) {
            const parts = rel.split("/");
            parts.pop();
            setStore("lastChangedPath", { path: parts.join("/"), timestamp: Date.now() });
            nonIgnoreChange = true;
          }
        }
      });

      if (ignoreChanged) {
        loadIgnore(true);
        if (store.config.apiKey && store.folderId) {
          scanFolder(store.config, store.folderId).catch(e => console.error("Scan Syncthing impossible :", e));
        }
      }

      if (nonIgnoreChange) {
        setStore("filesVersion", v => v + 1);
      }
    });

    onCleanup(() => {
      unlistenPromise.then(unlisten => unlisten()).catch(console.error);
    });
  });

  const handleRefresh = async () => {
    if (store.config.apiKey && store.folderId) {
      try {
        const path = await getFolderPath(store.config, store.folderId);
        setStore("rootPath", path);
      } catch (e) {
        console.error("Rafraîchissement du dossier impossible :", e);
      }
    }

    await loadIgnore(true);

    if (store.config.apiKey && store.folderId) {
      try {
        await scanFolder(store.config, store.folderId);

        let attempts = 0;
        while (attempts < 20) {
          setFolderStatus("scanning");
          await new Promise(r => setTimeout(r, 500));
          try {
            const status = await getFolderStatus(store.config, store.folderId);
            setFolderStatus(status.state);
            if (status.state === "idle") break;
          } catch (e) { }
          attempts++;
        }
      } catch (e) {
        console.error("Scan Syncthing impossible :", e);
      }
    }

    setStore("filesVersion", v => v + 1);
  };

  const handleDiscard = async () => {
    if (store.localPath) {
      await loadIgnore();
      if (store.config.apiKey && store.folderId) {
        scanFolder(store.config, store.folderId).catch(console.error);
      }
      setMsg("Modifications annulées.");
    }
  };


  const handleSave = async () => {
    if (!store.localPath) {
      setMsg("Configure d’abord le dossier local.");
      setShowSettings(true);
      return;
    }
    setSaving(true);
    try {
      const items = Object.values(store.selectedItems);
      const targetPath = getStignorePath(normalizeLocalFolderPath(store.localPath));
      await saveIgnore(targetPath, items);
      setStore("localPath", normalizeLocalFolderPath(store.localPath));
      setStore("savedSelectedItems", JSON.parse(JSON.stringify(store.selectedItems)));

      if (store.config.apiKey && store.folderId) {
        scanFolder(store.config, store.folderId).catch(console.error);
      }

      setMsg(".stignore enregistré.");
    } catch (e) {
      setMsg(`Erreur : ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const openIgnores = () => {
    const folderPath = normalizeLocalFolderPath(store.localPath || store.rootPath);
    if (folderPath) {
      invoke("open_path", { path: getStignorePath(folderPath) }).catch(console.error);
    }
  };

  const openFolder = () => {
    const folderPath = normalizeLocalFolderPath(store.localPath || store.rootPath);
    if (folderPath) {
      invoke("open_path", { path: folderPath }).catch(console.error);
    }
  };

  const rootNode = {
    name: "",
    type: "directory",
    children: []
  };

  return (
    <div class="h-screen w-screen bg-[#121212] text-[#e0e0e0] flex flex-col font-sans text-sm selection:bg-[#088fa1] selection:text-white">
      <div class="h-14 bg-[#232323] border-b border-[#1c1c1c] flex items-center justify-between px-4 shadow-sm shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-[#d9534f] to-[#a94442] flex items-center justify-center text-white shadow-inner border border-[#a0302d]">
            <svg viewBox="0 0 24 24" fill="none" class="w-5 h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" fill="rgba(255,255,255,0.2)" stroke="none"></circle>
              <path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" stroke-opacity="0.8"></path>

              <path d="M12 9V5" stroke-opacity="0.6"></path>
              <circle cx="12" cy="4" r="1.5" fill="white"></circle>

              <path d="M14.5 13.5L17.5 16.5" stroke-opacity="0.6"></path>
              <circle cx="18" cy="17" r="1.5" fill="white"></circle>

              <path d="M9.5 13.5L6.5 16.5" stroke-opacity="0.4" stroke-dasharray="2 2"></path>
              <path d="M5 16l2 2m0 -2l-2 2" stroke="white" stroke-width="1.5"></path>

              <path d="M14 10.5L17 7.5" stroke-opacity="0.4" stroke-dasharray="2 2"></path>
              <path d="M17 6l2 2m0 -2l-2 2" stroke="white" stroke-width="1.5" transform="translate(1 1)"></path>
            </svg>
          </div>
          <h1 class="text-xl font-bold tracking-tight text-[#e0e0e0]">
            StreamThing
          </h1>
        </div>

        <div class="flex items-center gap-4">
          <div class="flex items-center gap-1">
            <button
              onClick={handleRefresh}
              class="flex items-center gap-2 px-3 py-1.5 hover:bg-[#333] rounded text-[#aaa] hover:text-white transition-colors text-sm"
              title="Rafraîchir les fichiers et demander un scan Syncthing"
              aria-label="Rafraîchir les fichiers"
            >
              <RefreshCw class="w-4 h-4" />
              <span class="hidden sm:inline">Rafraîchir</span>
            </button>

            <div class="h-6 w-px bg-[#444] mx-1"></div>

            <button
              onClick={() => setShowSettings(true)}
              class="flex items-center gap-2 px-3 py-1.5 hover:bg-[#333] rounded text-[#aaa] hover:text-white transition-colors text-sm"
              title="Ouvrir les réglages Syncthing"
              aria-label="Ouvrir les réglages"
            >
              <SettingsIcon class="w-4 h-4" />
              <span class="hidden sm:inline">Réglages</span>
            </button>

            <button
              onClick={handleDiscard}
              class="flex items-center gap-2 bg-[#d9534f] hover:bg-[#c9302c] text-white px-3 sm:px-4 py-1.5 rounded text-sm font-bold shadow-sm active:shadow-inner transition-colors"
              title="Revenir à l’état enregistré du fichier .stignore"
              aria-label="Annuler les changements"
            >
              <RotateCcw class="w-4 h-4" />
              <span class="hidden sm:inline">Annuler</span>
            </button>

            <button
              onClick={handleSave}
              disabled={saving()}
              class="ml-1 sm:ml-2 flex items-center gap-2 bg-[#5cb85c] hover:bg-[#449d44] text-white px-3 sm:px-4 py-1.5 rounded text-sm font-bold shadow-sm active:shadow-inner disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Écrire la sélection dans .stignore"
              aria-label="Enregistrer .stignore"
            >
              <SaveIcon class="w-4 h-4" />
              <span class="hidden sm:inline">{saving() ? "Enregistrement..." : "Enregistrer"}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4 md:p-8">
        <div class="max-w-5xl mx-auto space-y-6">

          <Show when={store.stignoreWarning}>
            <div class="bg-[#d9534f]/20 border border-[#d9534f] rounded-md px-4 py-2 text-[#f5a623] text-sm">
              {store.stignoreWarning}
            </div>
          </Show>

          <div class="flex items-center justify-between text-[#888]">
            <p>{msg() || "Prêt à synchroniser."}</p>
            <div class="flex items-center gap-4 text-xs">
              <div>
                ID dossier : <span onClick={openFolder} class="text-[#bbb] font-mono cursor-pointer hover:text-white hover:underline" title="Ouvrir le dossier local">{store.folderId}</span>
              </div>
              <div class="h-3 w-px bg-[#444]"></div>
              <div class="flex items-center gap-1.5" title={`État Syncthing brut : ${folderStatus()}`}>
                <span class="uppercase font-bold tracking-wider text-[10px] text-[#666]">État :</span>
                <span class={`text-[11px] px-1.5 py-0.5 rounded font-mono ${folderStatus() === 'idle' ? 'bg-green-900/30 text-green-400 border border-green-900/50' :
                    folderStatus() === 'scanning' ? 'bg-blue-900/30 text-blue-400 border border-blue-900/50 animate-pulse' :
                      folderStatus() === 'syncing' ? 'bg-blue-900/30 text-blue-400 border border-blue-900/50' :
                        'bg-gray-800 text-gray-400'
                  }`}>
                  {formatFolderStatus(folderStatus())}
                </span>
              </div>
              <div class="h-3 w-px bg-[#444]"></div>
              <button onClick={openIgnores} class="hover:text-blue-400 underline decoration-dotted transition-colors" title="Ouvrir le fichier .stignore">
                ouvrir .stignore
              </button>
            </div>
          </div>

          <div class="bg-[#2d2d2d] rounded shadow-sm border border-[#222] overflow-hidden">
            <div class="px-4 py-3 bg-[#333] border-b border-[#222] flex items-center justify-between">
              <div class="flex items-center gap-2">
                <h2 class="text-base font-medium text-[#f0f0f0]">Fichiers</h2>
              </div>
              <div
                class="text-xs text-[#888] cursor-pointer hover:text-[#bbb] transition-colors"
                onClick={openFolder}
                title="Ouvrir dans l’explorateur"
              >
                {store.localPath ? store.localPath : "Aucun chemin configuré"}
              </div>
            </div>

            <FilterPanel filters={filters()} onUpdate={updateFilter} onClear={clearFilters} />

            <div class="p-4 bg-[#232323] min-h-[400px]">
              <FileTreeNode
                node={rootNode}
                parentPath=""
                filters={filters()}
              />
            </div>
          </div>

        </div>
      </div>

      <Modal isOpen={showSettings()} onClose={() => setShowSettings(false)} title="Réglages">
        <Settings onConnect={() => setShowSettings(false)} />
      </Modal>

      <Show when={loading()}>
        <div class="fixed inset-0 bg-[#121212] z-[60] flex items-center justify-center">
          <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#088fa1]"></div>
        </div>
      </Show>

    </div>
  );
}

export default App;
