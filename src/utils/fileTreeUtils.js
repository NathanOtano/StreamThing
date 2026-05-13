export const normalizeTreePath = (value = "") => {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
};

export const entryPathForParent = (entryName, parentPath = "") => {
  const parent = normalizeTreePath(parentPath);
  const raw = normalizeTreePath(entryName);

  if (!parent) return raw;
  if (!raw) return parent;
  if (raw === parent || raw.startsWith(`${parent}/`)) return raw;
  return `${parent}/${raw}`;
};

export const displayNameForPath = (path) => {
  const normalized = normalizeTreePath(path);
  if (!normalized) return "";
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || normalized;
};

export const normalizeEntryType = (value) => {
  const type = String(value ?? "").toLowerCase();
  if (!type) return value;
  if (type === "dir" || type === "directory" || type.includes("directory")) return "directory";
  if (type === "file" || type.includes("file")) return "file";
  return value;
};

export const normalizeTreeEntry = (entry, parentPath, source) => {
  const path = entryPathForParent(entry.name, parentPath);
  const rawType = entry.type ?? entry.fileType ?? entry.file_type;

  return {
    ...entry,
    name: displayNameForPath(path),
    path,
    type: normalizeEntryType(rawType),
    _source: source,
  };
};

export const shouldHideSystemEntry = (entry) => {
  const path = normalizeTreePath(entry.path ?? entry.name);
  const name = displayNameForPath(path);
  return name === ".stfolder" || name === ".stignore";
};
