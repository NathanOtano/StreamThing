
// Convert wildcard pattern (*, ?) to Regex
const patternToRegex = (pattern) => {
    // Escape special regex characters except * and ?
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    // Replace * with .* and ? with .
    const regexString = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    return new RegExp(regexString, 'i'); // Case insensitive
};

// Check if value matches any of the comma-separated patterns
const matchPattern = (value, patternsStr, mode = 'exact') => {
    if (!patternsStr || patternsStr.trim() === '') return true;

    const patterns = patternsStr.split(',').map(p => p.trim()).filter(p => p);
    if (patterns.length === 0) return true;

    return patterns.some(p => {
        // Handle wildcards if present
        if (p.includes('*') || p.includes('?')) {
            // For 'contains', 'startsWith', etc, we might need to adjust the regex
            // But if user explicitly uses wildcards, we treat it as a glob match on the WHOLE string relative to mode?
            // Actually, user said "use * as wildcard".
            // If mode is 'startsWith', "A*" means starts with A... 
            // Let's rely on the mode mapping unless it's a raw glob?
            // "Separate with comas, use * as wildcard"

            // Let's interpret strict wildcards:
            // If mode is 'startsWith', we prepend ^. 
            // But if the user types "A*", and mode is 'startsWith', they effectively mean "^A*".
            // Let's just use the logic appropriate for the field type.

            // Actually, standard behavior:
            // "Starts With" input: "foo" -> matches "^foo.*"
            // If user types "f*o", in "Starts With", it's weird. 
            // Let's assume the INPUT determines the constraint, and wildcards are allowed WITHIN that.

            // StartsWith: Value must match pattern at start. pattern can contain wildcards.
            // e.g. "image_*" in startsWith -> matches "image_01.png"

            const regexPart = p.replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');

            if (mode === 'startsWith') return new RegExp(`^${regexPart}`, 'i').test(value);
            if (mode === 'endsWith') return new RegExp(`${regexPart}$`, 'i').test(value);
            if (mode === 'contains') return new RegExp(`${regexPart}`, 'i').test(value);
            if (mode === 'exact') return new RegExp(`^${regexPart}$`, 'i').test(value);
            return false;
        }

        // No wildcards in input - use standard string methods (case insensitive)
        const val = value.toLowerCase();
        const pat = p.toLowerCase();

        if (mode === 'startsWith') return val.startsWith(pat);
        if (mode === 'endsWith') return val.endsWith(pat);
        if (mode === 'contains') return val.includes(pat);
        if (mode === 'exact') return val === pat;

        return false;
    });
};

export const matchesFilter = (node, parentPath, filters) => {
    if (!node) return false;

    // 1. Extension / Type
    // If directory, check if user searches for 'directory' or 'folder'?
    // User said "Extension or type (.mp4, .mov, image, video etc...)".
    // For folders, we shouldn't filter them out based on extension usually?
    // Let's assume filters apply to FILES. Folders are transparent (always show).
    if (node.type === 'directory') return true;

    const fullPath = normalizeTreePath(node.path || entryPathForParent(node.name, parentPath));
    const name = displayNameForPath(fullPath) || node.name;
    const folderPath = normalizeTreePath(parentPath || fullPath.split('/').slice(0, -1).join('/'));

    // Starts With
    if (filters.startsWith && !matchPattern(name, filters.startsWith, 'startsWith')) return false;

    // Contains
    if (filters.contains && !matchPattern(name, filters.contains, 'contains')) return false;

    // Finishes With
    if (filters.endsWith && !matchPattern(name, filters.endsWith, 'endsWith')) return false;

    // In Folder
    // "file contained in a certain folder path containing this text"
    // We check the parentPath (folder structure)
    if (filters.inFolder) {
        if (!folderPath) return false; // No folder
        // The user says "containing this text". So 'contains' match on parentPath.
        if (!matchPattern(folderPath, filters.inFolder, 'contains')) return false;
    }

    // Extension / Type
    if (filters.extension) {
        // patterns: .mp4, video, etc.
        // If pattern starts with ., treat as extension endswith.
        // If pattern is generic word, maybe check mime? (Don't have mime).
        // Let's stick to extension check (endsWith) or whole-type match?

        const patterns = filters.extension.split(',').map(p => p.trim().toLowerCase());
        const hasMatch = patterns.some(pat => {
            if (pat === 'image' || pat === 'video') {
                // heuristic? 
                // Simple mapping
                const ext = name.split('.').pop().toLowerCase();
                if (pat === 'image') return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext);
                if (pat === 'video') return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
                if (pat === 'audio') return ['mp3', 'wav', 'aac', 'ogg'].includes(ext);
            }

            // Wildcards allowed in extension too?
            if (pat.includes('*') || pat.includes('?')) {
                const regexPart = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
                // Match against end of file? or whole name? "Extension or type"
                // Usually checks extension.
                // If I say "*.mp4", that's a whole name glob.
                // If I say "mp4", that's extension.
                // Let's assume if it doesn't have a dot, it's an extension.
                if (!pat.includes('.')) return name.toLowerCase().endsWith('.' + pat);
                return new RegExp(`${regexPart}$`, 'i').test(name);
            }

            if (pat.startsWith('.')) return name.toLowerCase().endsWith(pat);
            return name.toLowerCase().endsWith('.' + pat);
        });
        if (!hasMatch) return false;
    }

    return true;
};
import { displayNameForPath, entryPathForParent, normalizeTreePath } from "./fileTreeUtils";
