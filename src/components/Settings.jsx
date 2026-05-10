import { createSignal, onMount, For } from "solid-js";
import { store, setStore } from "../store";
import { checkConnection } from "../services/api";

const Settings = (props) => {
    const [status, setStatus] = createSignal("");
    const [loading, setLoading] = createSignal(false);
    const [recentConfigs, setRecentConfigs] = createSignal([]);

    onMount(() => {
        loadHistory();
    });

    const loadHistory = () => {
        try {
            const hist = JSON.parse(localStorage.getItem("configHistory") || "[]");
            setRecentConfigs(hist);
        } catch (e) {
            console.error(e);
        }
    };

    const saveHistory = (config, folderId, localPath) => {
        const entry = {
            config: { ...config },
            folderId,
            localPath,
            timestamp: Date.now(),
            name: `${folderId} (${config.url})`
        };

        let hist = [...recentConfigs()];
        // Remove duplicate if exists (same folderId + url)
        hist = hist.filter(h => !(h.folderId === folderId && h.config.url === config.url));
        // Add to top
        hist.unshift(entry);
        // Limit to 5
        hist = hist.slice(0, 5);

        localStorage.setItem("configHistory", JSON.stringify(hist));
        setRecentConfigs(hist);
    };

    const loadConfig = (entry) => {
        setStore("config", "url", entry.config.url);
        setStore("config", "apiKey", entry.config.apiKey);
        setStore("folderId", entry.folderId);
        setStore("localPath", entry.localPath || "");
    };

    const handleCheck = async () => {
        setLoading(true);
        setStatus("Vérification...");
        try {
            const ok = await checkConnection(store.config);
            if (ok) {
                setStatus("Connexion réussie.");
                saveHistory(store.config, store.folderId, store.localPath);
                if (props.onConnect) props.onConnect();
            } else {
                setStatus("Connexion impossible.");
            }
        } catch (e) {
            setStatus("Erreur : " + e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form class="space-y-4" autocomplete="off" onSubmit={(e) => { e.preventDefault(); handleCheck(); }}>
            {/* Recent Configs Dropdown */}
            {recentConfigs().length > 0 && (
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-400 mb-1">Configurations récentes</label>
                    <select
                        class="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        title="Charger une configuration Syncthing déjà utilisée"
                        onChange={(e) => {
                            if (e.target.value === "") return;
                            const idx = parseInt(e.target.value);
                            loadConfig(recentConfigs()[idx]);
                        }}
                    >
                        <option value="">Charger une configuration...</option>
                        <For each={recentConfigs()}>
                            {(item, i) => <option value={i()}>{item.name}</option>}
                        </For>
                    </select>
                </div>
            )}

            <div>
                <h3 class="text-xl font-bold mb-4 text-white">Configuration</h3>
                <label class="block text-sm font-medium text-gray-400 mb-1">URL Syncthing</label>
                <input
                    type="text"
                    autocomplete="username"
                    value={store.config.url}
                    onInput={(e) => setStore("config", "url", e.target.value)}
                    class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="http://localhost:8384"
                    title="Adresse locale de l’interface API Syncthing"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Clé API</label>
                <input
                    type="password"
                    autocomplete="new-password"
                    value={store.config.apiKey}
                    onInput={(e) => setStore("config", "apiKey", e.target.value)}
                    class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Entrer la clé API"
                    title="Clé API Syncthing autorisant la lecture du dossier et le scan"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">ID du dossier</label>
                <input
                    type="text"
                    value={store.folderId}
                    onInput={(e) => setStore("folderId", e.target.value)}
                    class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="ex. abcde-fghij"
                    title="Identifiant Syncthing du dossier à piloter"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Dossier local</label>
                <input
                    type="text"
                    value={store.localPath}
                    onInput={(e) => setStore("localPath", e.target.value)}
                    class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="C:\Chemin\Vers\Dossier"
                    title="Dossier local contenant le fichier .stignore"
                />
            </div>

            <div class="flex items-center justify-between pt-2">
                <button
                    type="submit"
                    disabled={loading()}
                    class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow-lg disabled:opacity-50 transition-colors"
                    title="Tester l’accès à l’API Syncthing"
                >
                    {loading() ? "Vérification..." : "Tester la connexion"}
                </button>
                <span class="text-sm text-green-400 font-semibold">{status()}</span>
            </div>
        </form>
    );
};

export default Settings;
