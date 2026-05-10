import { Show } from "solid-js";
import X from "lucide-solid/icons/x";

const Modal = (props) => {
    return (
        <Show when={props.isOpen}>
            <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div class="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg relative overflow-hidden flex flex-col max-h-[90vh]">
                    {/* Header */}
                    <div class="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                        <h3 class="text-xl font-bold text-white">{props.title || "Modal"}</h3>
                        <button
                            onClick={props.onClose}
                            class="text-gray-400 hover:text-white hover:bg-gray-800 rounded-full p-1 transition-colors"
                            title="Fermer"
                            aria-label="Fermer"
                        >
                            <X class="w-6 h-6" />
                        </button>
                    </div>

                    {/* Content */}
                    <div class="p-6 overflow-y-auto">
                        {props.children}
                    </div>
                </div>
            </div>
        </Show>
    );
};

export default Modal;
