"use client";

import { useEffect, useRef, useState, RefObject } from "react";
import type { Canvas } from "fabric";
import type { CanvasSize } from "./Editor";
import {
  listTemplates,
  saveTemplate,
  updateTemplate,
  deleteTemplate,
  type SavedTemplate,
} from "@/lib/templates";

interface Props {
  fabricRef: RefObject<Canvas | null>;
  canvasSize: CanvasSize;
  onLoad: (json: Record<string, unknown>) => void;
  onClose: () => void;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TemplatesModal({ fabricRef, canvasSize, onLoad, onClose }: Props) {
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [name, setName]           = useState("");
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState("");
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [renameId, setRenameId]   = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    setTemplates(await listTemplates());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    nameRef.current?.focus();
  }, []);

  const handleSave = async () => {
    const c = fabricRef.current;
    if (!c) return;
    const trimmed = name.trim();
    if (!trimmed) { nameRef.current?.focus(); return; }
    setSaving(true);
    try {
      const thumbnail = c.toDataURL({ multiplier: 0.18, format: "jpeg", quality: 0.7 });
      const canvasJSON = JSON.stringify({
        ...c.toObject(["data"]),
        _certgen: { canvasSize, bgColor: (c.backgroundColor as string) || "#ffffff" },
      });
      await saveTemplate({ name: trimmed, thumbnail, canvasJSON });
      setName("");
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = (t: SavedTemplate) => {
    try {
      onLoad(JSON.parse(t.canvasJSON));
      onClose();
    } catch {
      alert("Could not load template — data may be corrupted.");
    }
  };

  const handleDelete = async (id: string) => {
    await deleteTemplate(id);
    setDeleteId(null);
    await refresh();
  };

  const handleUpdate = async (t: SavedTemplate) => {
    const c = fabricRef.current;
    if (!c) return;
    setUpdatingId(t.id);
    try {
      const thumbnail = c.toDataURL({ multiplier: 0.18, format: "jpeg", quality: 0.7 });
      const canvasJSON = JSON.stringify({
        ...c.toObject(["data"]),
        _certgen: { canvasSize, bgColor: (c.backgroundColor as string) || "#ffffff" },
      });
      await updateTemplate(t.id, { canvasJSON, thumbnail, savedAt: Date.now() });
      await refresh();
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRenameStart = (t: SavedTemplate) => {
    setRenameId(t.id);
    setRenameVal(t.name);
  };

  const handleRenameCommit = async (id: string) => {
    const trimmed = renameVal.trim();
    if (trimmed) await updateTemplate(id, { name: trimmed });
    setRenameId(null);
    setRenameVal("");
    await refresh();
  };

  const handleRenameCancel = () => {
    setRenameId(null);
    setRenameVal("");
  };

  const query = search.toLowerCase().trim();
  const visible = query
    ? templates.filter((t) => t.name.toLowerCase().includes(query))
    : templates;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-800 text-lg">Saved Templates</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {templates.length} template{templates.length !== 1 ? "s" : ""} stored in IndexedDB
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Save current */}
        <div className="px-7 py-4 border-b border-gray-100 bg-gray-50/60">
          <p className="text-xs font-medium text-gray-500 mb-2">Save current canvas as a new template</p>
          <div className="flex gap-2">
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Template name…"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {saving ? (
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M6.5 1v8M3.5 6l3 3 3-3" />
                  <path d="M1.5 11.5h10" />
                </svg>
              )}
              Save
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-7 py-3 border-b border-gray-100">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="5.5" cy="5.5" r="4" />
              <path d="M9 9l3.5 3.5" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M2 2l8 8M10 2L2 10" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Template grid */}
        <div className="flex-1 overflow-y-auto p-7">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <svg className="animate-spin w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
              </svg>
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center text-gray-400 py-16">
              {query ? (
                <>
                  <p className="text-sm">No templates matching <strong>&ldquo;{search}&rdquo;</strong></p>
                  <button onClick={() => setSearch("")} className="mt-2 text-xs text-blue-500 hover:underline">Clear search</button>
                </>
              ) : (
                <>
                  <svg className="mx-auto mb-3 text-gray-300" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <rect x="4" y="4" width="14" height="14" rx="2" />
                    <rect x="22" y="4" width="14" height="14" rx="2" />
                    <rect x="4" y="22" width="14" height="14" rx="2" />
                    <rect x="22" y="22" width="14" height="14" rx="2" />
                  </svg>
                  <p className="text-sm">No saved templates yet.</p>
                  <p className="text-xs mt-1">Give your current design a name above and hit Save.</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-5">
              {visible.map((t) => (
                <div
                  key={t.id}
                  className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow group flex flex-col"
                >
                  {/* Thumbnail */}
                  <div
                    className="bg-gray-100 h-40 flex items-center justify-center overflow-hidden cursor-pointer"
                    onClick={() => handleLoad(t)}
                  >
                    {t.thumbnail ? (
                      <img
                        src={t.thumbnail}
                        alt={t.name}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <span className="text-gray-300 text-xs">No preview</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3.5 flex flex-col flex-1">
                    {renameId === t.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")  { e.preventDefault(); handleRenameCommit(t.id); }
                          if (e.key === "Escape") { e.preventDefault(); handleRenameCancel(); }
                        }}
                        onBlur={() => handleRenameCommit(t.id)}
                        className="text-sm font-medium text-gray-800 w-full border border-blue-400 rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    ) : (
                      <p className="text-sm font-medium text-gray-800 truncate" title={t.name}>{t.name}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5 mb-3">{formatDate(t.savedAt)}</p>
                    <div className="flex gap-1.5 mt-auto">
                      <button
                        onClick={() => handleLoad(t)}
                        className="flex-1 text-xs py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleUpdate(t)}
                        disabled={!!updatingId}
                        title="Overwrite with current canvas"
                        className="px-2.5 text-xs py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors disabled:opacity-40"
                      >
                        {updatingId === t.id ? (
                          <svg className="animate-spin w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 12 12">
                            <circle cx="6" cy="6" r="4" strokeOpacity="0.2"/>
                            <path d="M6 2a4 4 0 0 1 4 4" strokeLinecap="round"/>
                          </svg>
                        ) : (
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 5A4 4 0 0 1 9.3 3.5M9.5 1.5v2.5H7"/>
                            <path d="M10 6A4 4 0 0 1 1.7 7.5M1.5 9.5V7H4"/>
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => handleRenameStart(t)}
                        title="Rename"
                        className="px-2.5 text-xs py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7.5 1.5l2 2-6 6H1.5v-2l6-6z"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteId(t.id)}
                        title="Delete"
                        className="px-2.5 text-xs py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                          <path d="M1.5 2.5h8M4 2.5V1.5h3V2.5M2.5 2.5l.5 7h5.5l.5-7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80">
            <h3 className="font-semibold text-gray-800 mb-2">Delete template?</h3>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
