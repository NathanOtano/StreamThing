import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const outDir = path.join(__dirname, "out");
const reportPath = path.join(outDir, "REPORT.local.md");
const codeRootFallback = path.resolve(repoRoot, "..");

const ITERATIONS = {
  endpoints: 5,
  watcher: 12,
  filters: 250,
  toggles: 1000,
  recursiveLimit: 8000,
};

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function normalizePath(value) {
  return path.resolve(value.replace(/^~(?=\\|\/)/, os.homedir())).toLowerCase();
}

function toSyncthingPrefix(rootPath, targetPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative.split(path.sep).join("/");
}

function xmlDecode(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function parseAttrs(value) {
  const attrs = {};
  for (const match of value.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attrs[match[1]] = xmlDecode(match[2]);
  }
  return attrs;
}

function findSyncthingConfig() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA ?? "", "Syncthing", "config.xml"),
    path.join(process.env.APPDATA ?? "", "Syncthing", "config.xml"),
    path.join(os.homedir(), ".config", "syncthing", "config.xml"),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

async function readSyncthingConfig() {
  const configPath = findSyncthingConfig();
  if (!configPath) {
    return { ok: false, error: "config.xml Syncthing introuvable" };
  }

  const xml = await fsp.readFile(configPath, "utf8");
  const gui = xml.match(/<gui\b[^>]*>([\s\S]*?)<\/gui>/);
  const address = gui?.[1]?.match(/<address>([^<]*)<\/address>/)?.[1] ?? "127.0.0.1:8384";
  const apiKey = gui?.[1]?.match(/<apikey>([^<]*)<\/apikey>/)?.[1] ?? "";
  const folders = [];

  for (const match of xml.matchAll(/<folder\b([^>]*)>([\s\S]*?)<\/folder>/g)) {
    const attrs = parseAttrs(match[1]);
    const body = match[2];
    const folderPath = body.match(/<path>([^<]*)<\/path>/)?.[1] ?? "";
    const paused = body.match(/<paused>([^<]*)<\/paused>/)?.[1] === "true";
    folders.push({
      id: attrs.id ?? "",
      label: attrs.label ?? "",
      path: xmlDecode(folderPath),
      paused,
    });
  }

  const baseUrl = address.startsWith("http://") || address.startsWith("https://")
    ? address
    : `http://${address}`;

  return {
    ok: true,
    configPath,
    baseUrl,
    apiKey,
    apiKeyPresent: apiKey.length > 0,
    folders,
  };
}

function stats(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? null;
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    minMs: round(sorted[0] ?? 0),
    p50Ms: round(pick(0.5) ?? 0),
    p95Ms: round(pick(0.95) ?? 0),
    maxMs: round(sorted[sorted.length - 1] ?? 0),
    avgMs: round(sorted.length ? sum / sorted.length : 0),
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

async function timed(fn) {
  const start = performance.now();
  const value = await fn();
  return { value, ms: round(performance.now() - start) };
}

function timedSync(fn) {
  const start = performance.now();
  const value = fn();
  return { value, ms: round(performance.now() - start) };
}

async function httpJson(config, endpoint, query = {}, method = "GET") {
  const url = new URL(endpoint, config.baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const start = performance.now();
  const response = await fetch(url, {
    method,
    headers: { "X-API-Key": config.apiKey },
  });
  const text = await response.text();
  const elapsed = round(performance.now() - start);
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    ms: elapsed,
    json,
    text: json === null ? text : "",
    error: response.ok ? "" : text.trim(),
  };
}

async function repeat(label, iterations, fn) {
  const runs = [];
  for (let i = 0; i < iterations; i += 1) {
    const result = await fn(i);
    runs.push(result);
  }
  return {
    label,
    stats: stats(runs.map((run) => run.ms)),
    runs,
  };
}

async function listLocal(rootPath, prefix = "") {
  const target = prefix ? path.join(rootPath, prefix) : rootPath;
  const entries = await fsp.readdir(target, { withFileTypes: true });
  const nodes = [];

  await Promise.all(entries.map(async (entry) => {
    if (entry.name === ".stfolder" || entry.name === ".stignore") return;
    const fullPath = path.join(target, entry.name);
    let size = 0;
    let modTime = "";
    try {
      const metadata = await fsp.stat(fullPath);
      size = entry.isDirectory() ? 0 : metadata.size;
      modTime = metadata.mtime.toISOString();
    } catch {
      return;
    }

    nodes.push({
      name: prefix ? `${prefix.replaceAll("\\", "/").replace(/\/$/, "")}/${entry.name}` : entry.name,
      type: entry.isDirectory() ? "directory" : "file",
      size,
      modTime,
      _source: "local",
    });
  }));

  nodes.sort(compareNodes);
  return nodes;
}

function compareNodes(a, b) {
  const aDir = a.type === "directory";
  const bDir = b.type === "directory";
  if (aDir && !bDir) return -1;
  if (!aDir && bDir) return 1;
  return a.name.localeCompare(b.name);
}

function mergeRemoteLocal(remoteFiles, localFiles) {
  const merged = new Map();
  for (const file of remoteFiles) {
    if (isSystemFile(file.name)) continue;
    merged.set(file.name, { ...file, _source: "remote" });
  }
  for (const file of localFiles) {
    if (isSystemFile(file.name)) continue;
    if (merged.has(file.name)) {
      merged.set(file.name, { ...merged.get(file.name), ...file, _source: "both" });
    } else {
      merged.set(file.name, { ...file, _source: "local" });
    }
  }
  return Array.from(merged.values()).sort(compareNodes);
}

function isSystemFile(name) {
  return name.endsWith("/.stfolder")
    || name.endsWith("/.stignore")
    || name === ".stfolder"
    || name === ".stignore";
}

function matchesFilter(node, parentPath, filters) {
  const name = node.name.split("/").pop()?.toLowerCase() ?? "";
  const fullPath = parentPath ? `${parentPath}/${node.name}`.toLowerCase() : node.name.toLowerCase();
  if (filters.startsWith && !name.startsWith(filters.startsWith.toLowerCase())) return false;
  if (filters.contains && !name.includes(filters.contains.toLowerCase())) return false;
  if (filters.endsWith && !name.endsWith(filters.endsWith.toLowerCase())) return false;
  if (filters.inFolder && !fullPath.includes(filters.inFolder.toLowerCase())) return false;
  if (filters.extension) {
    const ext = filters.extension.toLowerCase().replace(/^\./, "");
    if (!name.endsWith(`.${ext}`) && !node.type?.toLowerCase().includes(ext)) return false;
  }
  return true;
}

function benchmarkUiActions(nodes) {
  const filters = [
    { startsWith: "S", contains: "", endsWith: "", inFolder: "", extension: "" },
    { startsWith: "", contains: "cod", endsWith: "", inFolder: "", extension: "" },
    { startsWith: "", contains: "", endsWith: "", inFolder: "", extension: "md" },
    { startsWith: "", contains: "", endsWith: "", inFolder: "StreamThing", extension: "" },
  ];

  const filterRun = timedSync(() => {
    let totalMatches = 0;
    for (let i = 0; i < ITERATIONS.filters; i += 1) {
      const filter = filters[i % filters.length];
      totalMatches += nodes.filter((node) => matchesFilter(node, "", filter)).length;
    }
    return totalMatches;
  });

  const toggleRun = timedSync(() => {
    const selected = new Map();
    const limit = Math.max(nodes.length, 1);
    for (let i = 0; i < ITERATIONS.toggles; i += 1) {
      const node = nodes[i % limit];
      const key = node?.name ?? `missing-${i}`;
      selected.set(key, { path: key, isFolder: node?.type === "directory", selected: !selected.get(key)?.selected });
    }
    return selected.size;
  });

  const projectionRun = timedSync(() => nodes.map((node) => ({
    key: node.name,
    label: node.name.split("/").pop() ?? node.name,
    status: node._source ?? "local",
    className: node.type === "directory" ? "directory-row" : "file-row",
  })));

  return {
    filters: { ms: filterRun.ms, iterations: ITERATIONS.filters, totalMatches: filterRun.value },
    toggles: { ms: toggleRun.ms, iterations: ITERATIONS.toggles, selectedKeys: toggleRun.value },
    projection: { ms: projectionRun.ms, rows: projectionRun.value.length },
  };
}

async function benchmarkExpand(config, folder, prefix) {
  const remote = await timed(async () => {
    if (folder.paused) {
      return {
        ok: false,
        blocked: true,
        error: "folder is paused",
        items: [],
      };
    }
    const response = await httpJson(config, "/rest/db/browse", {
      folder: folder.id,
      prefix,
      levels: "1",
    });
    return {
      ok: response.ok,
      status: response.status,
      error: response.error,
      items: Array.isArray(response.json) ? response.json : [],
    };
  });

  const local = await timed(() => listLocal(folder.path, prefix));
  const merged = timedSync(() => mergeRemoteLocal(remote.value.items, local.value));

  return {
    prefix: prefix || ".",
    remoteMs: remote.ms,
    remoteOk: remote.value.ok,
    remoteStatus: remote.value.status ?? null,
    remoteError: remote.value.error ?? "",
    remoteCount: remote.value.items.length,
    localMs: local.ms,
    localCount: local.value.length,
    mergeMs: merged.ms,
    mergedCount: merged.value.length,
    totalMs: round(remote.ms + local.ms + merged.ms),
    rows: merged.value,
  };
}

async function walkLocalLimited(rootPath, limit) {
  const skipped = new Set([".git", "node_modules", "target", "dist", ".venv", "_workspace"]);
  const stack = [rootPath];
  let files = 0;
  let directories = 0;
  let visited = 0;

  const start = performance.now();
  while (stack.length && visited < limit) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (visited >= limit) break;
      if (skipped.has(entry.name)) continue;
      visited += 1;
      if (entry.isDirectory()) {
        directories += 1;
        stack.push(path.join(current, entry.name));
      } else {
        files += 1;
      }
    }
  }

  return {
    ms: round(performance.now() - start),
    visited,
    files,
    directories,
    limit,
    truncated: visited >= limit,
  };
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function measureFsWatch(watchPath, writeDir, recursive) {
  await fsp.mkdir(writeDir, { recursive: true });
  const latencies = [];
  const timeouts = [];
  const pending = new Map();

  const watcher = fs.watch(watchPath, { recursive }, (eventType, filename) => {
    const base = path.basename(String(filename ?? ""));
    const waiting = pending.get(base);
    if (!waiting) return;
    pending.delete(base);
    waiting.resolve({
      eventType,
      filename: String(filename ?? ""),
      ms: round(performance.now() - waiting.start),
    });
  });

  await wait(250);
  try {
    for (let i = 0; i < ITERATIONS.watcher; i += 1) {
      const name = `watch-${Date.now()}-${i}.tmp`;
      const fullPath = path.join(writeDir, name);
      const resultPromise = new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(name);
          resolve({ timeout: true, ms: 5000 });
        }, 5000);
        pending.set(name, {
          start: performance.now(),
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
        });
      });
      await fsp.writeFile(fullPath, `tick=${i}\n`, "utf8");
      const result = await resultPromise;
      if (result.timeout) {
        timeouts.push(result.ms);
      } else {
        latencies.push(result.ms);
      }
      await fsp.rm(fullPath, { force: true });
      await wait(50);
    }
  } finally {
    watcher.close();
  }

  return {
    watchPath,
    recursive,
    iterations: ITERATIONS.watcher,
    received: latencies.length,
    timeouts: timeouts.length,
    stats: stats(latencies),
  };
}

async function benchmarkSyncthingDbVisibility(config, folder, scratchDir) {
  if (folder.paused) {
    return {
      skipped: true,
      reason: "folder is paused",
    };
  }

  const prefix = toSyncthingPrefix(folder.path, scratchDir);
  const name = `db-visible-${Date.now()}.tmp`;
  const fullPath = path.join(scratchDir, name);
  await fsp.writeFile(fullPath, "syncthing db visibility probe\n", "utf8");

  const start = performance.now();
  let visible = false;
  let lastError = "";
  try {
    while (performance.now() - start < 10000) {
      const response = await httpJson(config, "/rest/db/browse", {
        folder: folder.id,
        prefix,
        levels: "1",
      });
      if (!response.ok) {
        lastError = response.error;
      } else {
        const items = Array.isArray(response.json) ? response.json : [];
        visible = items.some((item) => String(item.name ?? "").endsWith(name));
        if (visible) break;
      }
      await wait(250);
    }
  } finally {
    await fsp.rm(fullPath, { force: true });
  }

  return {
    skipped: false,
    visible,
    ms: round(performance.now() - start),
    prefix,
    lastError,
  };
}

function markdownTable(rows) {
  if (rows.length === 0) return "";
  const [header, ...body] = rows;
  const separator = header.map(() => "---");
  return [header, separator, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function formatEndpoint(endpoint) {
  const status = endpoint.runs[0]?.status ?? "";
  const ok = endpoint.runs.every((run) => run.ok);
  const firstError = endpoint.runs.find((run) => run.error)?.error ?? "";
  return [
    endpoint.label,
    ok ? "OK" : `bloqué (${status || "n/a"})`,
    `${endpoint.stats.p50Ms} ms`,
    `${endpoint.stats.p95Ms} ms`,
    firstError.replaceAll("\n", " ").slice(0, 80) || "-",
  ];
}

async function writeReport(results, jsonPath) {
  const endpointRows = [
    ["Endpoint", "État", "p50", "p95", "Erreur"],
    ...results.syncthing.endpoints.map(formatEndpoint),
  ];

  const expandRows = [
    ["Action UI simulée", "Remote DB", "Local", "Merge", "Total", "Lignes"],
    ...results.ui.expands.map((expand) => [
      `expand ${expand.prefix}`,
      expand.remoteOk ? `${expand.remoteMs} ms` : `bloqué: ${expand.remoteError || "n/a"}`,
      `${expand.localMs} ms (${expand.localCount})`,
      `${expand.mergeMs} ms`,
      `${expand.totalMs} ms`,
      `${expand.mergedCount}`,
    ]),
  ];

  const watcherRows = [
    ["Watcher", "Événements", "p50", "p95", "max"],
    [
      "Code racine récursif",
      `${results.watcher.codeRoot.received}/${results.watcher.codeRoot.iterations}`,
      `${results.watcher.codeRoot.stats.p50Ms} ms`,
      `${results.watcher.codeRoot.stats.p95Ms} ms`,
      `${results.watcher.codeRoot.stats.maxMs} ms`,
    ],
    [
      "Scratch ciblé",
      `${results.watcher.scratch.received}/${results.watcher.scratch.iterations}`,
      `${results.watcher.scratch.stats.p50Ms} ms`,
      `${results.watcher.scratch.stats.p95Ms} ms`,
      `${results.watcher.scratch.stats.maxMs} ms`,
    ],
  ];

  const dbVisibility = results.syncthing.dbVisibility.skipped
    ? `Non mesurée : ${results.syncthing.dbVisibility.reason}.`
    : `Visible=${results.syncthing.dbVisibility.visible}, délai=${results.syncthing.dbVisibility.ms} ms.`;

  const content = `# Benchmark UI / fichiers / Syncthing / watcher

## Résumé

- Dossier mesuré : \`${results.folder.label}\` (\`${results.folder.id}\`) vers \`${results.folder.path}\`.
- État Syncthing : \`${results.folder.paused ? "paused" : "active"}\`.
- Version Syncthing : \`${results.syncthing.version.version ?? "inconnue"}\`.
- Résultat JSON : \`${jsonPath}\`.

## Lecture API Syncthing

${markdownTable(endpointRows)}

Visibilité DB après écriture locale : ${dbVisibility}

## Actions UI et répertoire

Les actions UI ci-dessous mesurent le pipeline de données utilisé par l’interface, pas un rendu WebView/Tauri complet.

${markdownTable(expandRows)}

- Filtres UI simulés : \`${results.ui.actions.filters.iterations}\` passes en \`${results.ui.actions.filters.ms} ms\`.
- Toggles de sélection simulés : \`${results.ui.actions.toggles.iterations}\` toggles en \`${results.ui.actions.toggles.ms} ms\`.
- Projection de lignes UI : \`${results.ui.actions.projection.rows}\` lignes en \`${results.ui.actions.projection.ms} ms\`.
- Parcours local limité du dossier mesuré : \`${results.localWalk.visited}\` entrées en \`${results.localWalk.ms} ms\`${results.localWalk.truncated ? " (tronqué)" : ""}.

## Watcher

${markdownTable(watcherRows)}

## Lecture

- Le watcher local est le chemin le plus réactif pour déclencher un rafraîchissement : les événements fichier arrivent en millisecondes sur le scratch.
- Le pipeline UI est surtout borné par la lecture locale et par la disponibilité de la base Syncthing. Les filtres, toggles et projections sont négligeables sur l’échantillon mesuré.
- Quand le dossier mesuré est en pause, la lecture DB Syncthing est bloquée. Tant que cet état reste vrai, l’UI ne peut pas comparer proprement local + DB distante via \`/rest/db/browse\`.
- Le watcher actuel de l’app ne doit pas déclencher un scan Syncthing complet par dossier à chaque événement. Préférer un rafraîchissement UI local/granulaire ou un scan ciblé quand Syncthing est actif.
`;

  await fsp.writeFile(reportPath, content, "utf8");
}

async function main() {
  await fsp.mkdir(outDir, { recursive: true });

  const config = await readSyncthingConfig();
  if (!config.ok) {
    throw new Error(config.error);
  }

  const version = await httpJson(config, "/rest/system/version");
  const liveFolders = await httpJson(config, "/rest/config/folders");
  const folders = Array.isArray(liveFolders.json) ? liveFolders.json : config.folders;
  const codeRoot = normalizePath(codeRootFallback);
  const folder = folders.find((item) => normalizePath(item.path) === codeRoot)
    ?? folders.find((item) => item.label === "Code")
    ?? folders.find((item) => normalizePath(item.path) === normalizePath(codeRootFallback));

  if (!folder) {
    throw new Error(`Aucun dossier Syncthing ne pointe vers ${codeRootFallback}`);
  }

  const normalizedFolder = {
    id: folder.id,
    label: folder.label || folder.id,
    path: path.resolve(folder.path.replace(/^~(?=\\|\/)/, os.homedir())),
    paused: Boolean(folder.paused),
  };

  const scratchDir = path.join(repoRoot, "pocs", "syncthing-ui-watch-benchmark", "out", "watch-scratch");
  await fsp.mkdir(scratchDir, { recursive: true });

  const endpoints = [
    await repeat("system/ping", ITERATIONS.endpoints, () => httpJson(config, "/rest/system/ping")),
    await repeat("config/folders", ITERATIONS.endpoints, () => httpJson(config, "/rest/config/folders")),
    await repeat("db/status folder", ITERATIONS.endpoints, () => httpJson(config, "/rest/db/status", { folder: normalizedFolder.id })),
    await repeat("db/browse folder root", ITERATIONS.endpoints, () => httpJson(config, "/rest/db/browse", { folder: normalizedFolder.id, levels: "1" })),
    await repeat("folder/errors folder", ITERATIONS.endpoints, () => httpJson(config, "/rest/folder/errors", { folder: normalizedFolder.id })),
    await repeat("db/completion folder", ITERATIONS.endpoints, () => httpJson(config, "/rest/db/completion", { folder: normalizedFolder.id })),
  ];

  const repoPrefix = toSyncthingPrefix(normalizedFolder.path, repoRoot);
  const rootExpand = await benchmarkExpand(config, normalizedFolder, "");
  const repoExpand = await benchmarkExpand(config, normalizedFolder, repoPrefix);
  const pocsExpand = await benchmarkExpand(config, normalizedFolder, `${repoPrefix}/pocs`);
  const combinedRows = mergeRemoteLocal([], [
    ...rootExpand.rows,
    ...repoExpand.rows,
    ...pocsExpand.rows,
  ]);

  const actions = benchmarkUiActions(combinedRows);
  const localWalk = await walkLocalLimited(normalizedFolder.path, ITERATIONS.recursiveLimit);
  const watcherCodeRoot = await measureFsWatch(normalizedFolder.path, scratchDir, true);
  const watcherScratch = await measureFsWatch(scratchDir, scratchDir, false);
  const dbVisibility = await benchmarkSyncthingDbVisibility(config, normalizedFolder, scratchDir);

  const results = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    folder: normalizedFolder,
    syncthing: {
      version: version.json ?? {},
      apiKeyPresent: config.apiKeyPresent,
      endpoints,
      dbVisibility,
    },
    ui: {
      expands: [rootExpand, repoExpand, pocsExpand].map(({ rows, ...rest }) => rest),
      actions,
    },
    localWalk,
    watcher: {
      codeRoot: watcherCodeRoot,
      scratch: watcherScratch,
    },
  };

  const jsonPath = path.join(outDir, `results-${nowStamp()}.json`);
  await fsp.writeFile(jsonPath, JSON.stringify(results, null, 2), "utf8");
  await writeReport(results, jsonPath);

  console.log(`report=${reportPath}`);
  console.log(`json=${jsonPath}`);
  console.log(`folder=${normalizedFolder.label} paused=${normalizedFolder.paused}`);
  console.log(`watcher_code_root_p50_ms=${watcherCodeRoot.stats.p50Ms}`);
  console.log(`watcher_scratch_p50_ms=${watcherScratch.stats.p50Ms}`);
  console.log(`ui_root_total_ms=${rootExpand.totalMs}`);
  console.log(`syncthing_db_browse_ok=${endpoints[3].runs.every((run) => run.ok)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
