import { useState, useEffect, useRef, useCallback } from 'react';

interface RenameModalProps {
    currentName: string;
    existingNames: string[];
    onSave: (newName: string) => void;
    onCancel: () => void;
}

export default function RenameModal({
    currentName,
    existingNames,
    onSave,
    onCancel,
}: RenameModalProps) {
    const [value, setValue] = useState(currentName);
    const inputRef = useRef<HTMLInputElement>(null);

    const trimmed = value.trim();
    const isEmpty = trimmed.length === 0;
    const isDuplicate =
        trimmed.toLowerCase() !== currentName.toLowerCase() &&
        existingNames.some(
            (n) => n.toLowerCase() === trimmed.toLowerCase()
        );
    const isUnchanged = trimmed === currentName;
    const canSave = !isEmpty && !isDuplicate && !isUnchanged;

    const validationError = isEmpty
        ? 'Name cannot be empty'
        : isDuplicate
            ? 'A document with this name already exists'
            : null;

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel();
            }
        },
        [onCancel]
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        inputRef.current?.focus();
        inputRef.current?.select();
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (canSave) {
            onSave(trimmed);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-modal-title"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black bg-opacity-40"
                onClick={onCancel}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
                <h3
                    id="rename-modal-title"
                    className="text-base font-semibold text-slate-900 mb-4"
                >
                    Rename Document
                </h3>

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label
                            htmlFor="rename-input"
                            className="block text-sm font-medium text-slate-700 mb-1"
                        >
                            Display Name
                        </label>
                        <input
                            ref={inputRef}
                            id="rename-input"
                            type="text"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 ${validationError
                                    ? 'border-red-300 focus:ring-red-500'
                                    : 'border-slate-300 focus:ring-blue-500'
                                }`}
                        />
                        {validationError && (
                            <p className="text-xs text-red-600 mt-1">{validationError}</p>
                        )}
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!canSave}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
