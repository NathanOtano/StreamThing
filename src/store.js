import { createStore } from "solid-js/store";

export const [store, setStore] = createStore({
    config: {
        url: "http://localhost:8384",
        apiKey: "",
    },
    folderId: "default",
    localPath: "",           // Local folder containing .stignore
    rootPath: "",            // Root folder path from Syncthing API
    selectedItems: {},       // path -> { path, isFolder, selected }
    savedSelectedItems: {},  // snapshot of disk state
    filesVersion: 0,         // Incremented to trigger re-fetch
    lastChangedPath: null,   // For granular file updates
    stignoreWarning: "",     // Warning message if stignore was reset to root
});

export const toggleSelection = (path, isFolder, selected) => {
    // We now always persist the state, even if false, to support "Exception" logic
    // (e.g. unchecking a file inside a checked folder)
    setStore("selectedItems", path, { path, isFolder, selected });
};
