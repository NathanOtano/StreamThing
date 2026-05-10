
const FilterInput = (props) => (
    <div class="flex-1 min-w-[80px]">
        <div class="relative group">
            <input
                type="text"
                value={props.value}
                onInput={(e) => props.onChange(e.target.value)}
                placeholder={props.label}
                title={props.tooltip || props.label}
                class="w-full bg-[#1e1e1e] border border-[#333] text-[#ddd] text-xs px-2 py-1.5 rounded focus:outline-none focus:border-[#4a90e2] focus:ring-1 focus:ring-[#4a90e2] transition-colors placeholder-[#666]"
            />
        </div>
    </div>
);

const FilterPanel = (props) => {
    return (
        <div class="bg-[#2a2a2a] border-b border-[#222] p-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <div class="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:overflow-x-auto no-scrollbar">
                <FilterInput
                    label="Début"
                    value={props.filters.startsWith}
                    onChange={v => props.onUpdate('startsWith', v)}
                    tooltip="Nom commençant par ce texte ou motif"
                />
                <FilterInput
                    label="Contient"
                    value={props.filters.contains}
                    onChange={v => props.onUpdate('contains', v)}
                    tooltip="Nom contenant ce texte"
                />
                <FilterInput
                    label="Fin"
                    value={props.filters.endsWith}
                    onChange={v => props.onUpdate('endsWith', v)}
                    tooltip="Nom finissant par ce texte ou motif"
                />
                <FilterInput
                    label="Dossier"
                    value={props.filters.inFolder}
                    onChange={v => props.onUpdate('inFolder', v)}
                    tooltip="Chemin de dossier contenant ce texte"
                />
                <FilterInput
                    label="Type"
                    value={props.filters.extension}
                    onChange={v => props.onUpdate('extension', v)}
                    tooltip="Extension ou famille de fichier, par exemple .mp4, vidéo, jpg"
                />
                {/* Active Indication / Clear */}
                {Object.values(props.filters).some(Boolean) && (
                    <button
                        onClick={props.onClear}
                        class="text-[10px] text-[#d9534f] hover:text-[#c9302c] hover:underline cursor-pointer whitespace-nowrap px-2"
                        title="Effacer les filtres"
                    >
                        Effacer
                    </button>
                )}
            </div>
        </div>
    );
};

export default FilterPanel;
