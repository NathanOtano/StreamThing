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

export const normalizeTreeEntry = (entry, parentPath, source) => {
  const path = entryPathForParent(entry.name, parentPath);

  return {
    ...entry,
    name: displayNameForPath(path),
    path,
    _source: source,
  };
};

export const shouldHideSystemEntry = (entry) => {
  const path = normalizeTreePath(entry.path ?? entry.name);
  const name = displayNameForPath(path);
  return name === ".stfolder" || name === ".stignore";
};
