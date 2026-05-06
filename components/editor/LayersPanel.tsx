"use client";

import { RefObject, useState } from "react";
import type { Canvas, Object as FabricObject, Textbox } from "fabric";

interface Props {
  layers: FabricObject[];
  fabricRef: RefObject<Canvas | null>;
  activeObject: FabricObject | null;
  setActiveObject: (obj: FabricObject | null) => void;
  syncLayers: () => void;
  saveSnapshot: () => void;
}

type ObjData = { role?: string; name?: string; locked?: boolean; qrText?: string };

function getObjData(obj: FabricObject): ObjData {
  return (obj as unknown as { data?: ObjData }).data ?? {};
}

function layerLabel(obj: FabricObject, index: number): string {
  const data = getObjData(obj);
  if (data.name) return data.name;
  if (data.role === "watermark") return "Watermark";
  if (data.role === "frame") return "Frame";
  if (data.role === "qr") return "QR Code";
  if (obj.type === "textbox" || obj.type === "i-text" || obj.type === "text") {
    const text = ((obj as Textbox).text ?? "").slice(0, 22);
    return `T  ${text || "Text"}`;
  }
  if (obj.type === "group") return `Group ${index + 1}`;
  if (obj.type === "rect") return `Rectangle ${index + 1}`;
  if (obj.type === "circle") return `Circle ${index + 1}`;
  if (obj.type === "line") return `Line ${index + 1}`;
  if (obj.type === "image") return `Image ${index + 1}`;
  return `Layer ${index + 1}`;
}

function layerIcon(obj: FabricObject) {
  const data = getObjData(obj);
  if (data.role === "watermark" || data.role === "frame") {
    return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="0.5" y="0.5" width="10" height="10" rx="1" />
        <circle cx="3.5" cy="3.5" r="1" fill="currentColor" stroke="none" />
        <path d="M0.5 8l3-2.5L6 8l2-2.5L10.5 8" />
      </svg>
    );
  }
  if (data.role === "qr") {
    return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.1">
        <rect x="0.5" y="0.5" width="4" height="4" rx="0.3" />
        <rect x="6.5" y="0.5" width="4" height="4" rx="0.3" />
        <rect x="0.5" y="6.5" width="4" height="4" rx="0.3" />
        <rect x="1.8" y="1.8" width="1.5" height="1.5" fill="currentColor" stroke="none" />
        <rect x="7.8" y="1.8" width="1.5" height="1.5" fill="currentColor" stroke="none" />
        <rect x="1.8" y="7.8" width="1.5" height="1.5" fill="currentColor" stroke="none" />
        <path d="M6.5 6.5h2v2M8.5 8.5h2.5v2.5M6.5 9.5v2" strokeLinecap="round" />
      </svg>
    );
  }
  if (obj.type === "textbox" || obj.type === "i-text" || obj.type === "text") {
    return <span className="font-bold text-xs leading-none">T</span>;
  }
  if (obj.type === "group") {
    return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="0.5" y="0.5" width="4.5" height="4.5" rx="0.5" />
        <rect x="6" y="0.5" width="4.5" height="4.5" rx="0.5" />
        <rect x="0.5" y="6" width="4.5" height="4.5" rx="0.5" />
        <rect x="6" y="6" width="4.5" height="4.5" rx="0.5" />
      </svg>
    );
  }
  if (obj.type === "rect") {
    return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="0.5" y="2" width="10" height="7" rx="0.5" />
      </svg>
    );
  }
  if (obj.type === "circle") {
    return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="5.5" cy="5.5" r="4.5" />
      </svg>
    );
  }
  if (obj.type === "line") {
    return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M1 9.5l9-8" />
      </svg>
    );
  }
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="0.5" y="0.5" width="10" height="10" rx="1" />
      <circle cx="3.5" cy="3.5" r="1" fill="currentColor" stroke="none" />
      <path d="M0.5 8l3-2.5L6 8l2-2.5L10.5 8" />
    </svg>
  );
}

export default function LayersPanel({
  layers,
  fabricRef,
  activeObject,
  setActiveObject,
  syncLayers,
  saveSnapshot,
}: Props) {
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const c = () => fabricRef.current;

  const select = (obj: FabricObject) => {
    const canvas = c();
    if (!canvas) return;
    canvas.setActiveObject(obj);
    canvas.renderAll();
    setActiveObject(obj);
  };

  const remove = (obj: FabricObject, e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = c();
    if (!canvas) return;
    canvas.remove(obj);
    canvas.discardActiveObject();
    canvas.renderAll();
    setActiveObject(null);
  };

  const duplicate = (obj: FabricObject, e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = c();
    if (!canvas) return;
    obj.clone(["data"]).then((cloned: FabricObject) => {
      cloned.set({ left: (obj.left ?? 0) + 16, top: (obj.top ?? 0) + 16 });
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();
      syncLayers();
      saveSnapshot();
    });
  };

  const toggleLock = (obj: FabricObject, e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = c();
    if (!canvas) return;
    const data = getObjData(obj);
    const locked = !data.locked;
    (obj as unknown as { data: ObjData }).data = { ...data, locked };
    obj.set({
      selectable: !locked,
      evented: !locked,
      hasControls: !locked,
      lockMovementX: locked,
      lockMovementY: locked,
    });
    if (locked && canvas.getActiveObject() === obj) {
      canvas.discardActiveObject();
      setActiveObject(null);
    }
    canvas.renderAll();
    syncLayers();
    saveSnapshot();
  };

  const moveUp = (obj: FabricObject, e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = c();
    if (!canvas) return;
    canvas.bringObjectForward(obj);
    canvas.renderAll();
    syncLayers();
  };

  const moveDown = (obj: FabricObject, e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = c();
    if (!canvas) return;
    canvas.sendObjectBackwards(obj);
    canvas.renderAll();
    syncLayers();
  };

  const startRename = (realIdx: number, obj: FabricObject, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = getObjData(obj).name ?? layerLabel(obj, realIdx);
    setRenamingIdx(realIdx);
    setRenameValue(current);
  };

  const commitRename = (obj: FabricObject) => {
    const canvas = c();
    if (!canvas) return;
    const data = getObjData(obj);
    const name = renameValue.trim();
    (obj as unknown as { data: ObjData }).data = { ...data, name: name || undefined };
    setRenamingIdx(null);
    syncLayers();
    saveSnapshot();
  };

  const reversed = [...layers].reverse();

  return (
    <aside className="w-52 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-3 py-2 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Layers
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {reversed.length === 0 && (
          <p className="text-xs text-gray-400 text-center mt-10 px-3 leading-5">
            No elements yet.
            <br />
            Add text or images.
          </p>
        )}

        {reversed.map((obj, i) => {
          const realIdx = layers.length - 1 - i;
          const isActive = obj === activeObject;
          const locked = getObjData(obj).locked ?? false;

          return (
            <div
              key={realIdx}
              onClick={() => !locked && select(obj)}
              className={`flex items-center gap-1.5 px-2 py-2 cursor-pointer border-b border-gray-50 group transition-colors text-sm ${
                isActive
                  ? "bg-blue-50 text-blue-800"
                  : locked
                  ? "text-gray-400 bg-gray-50 cursor-default"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {/* Icon */}
              <span className={`flex-shrink-0 ${isActive ? "text-blue-600" : "text-gray-400"}`}>
                {layerIcon(obj)}
              </span>

              {/* Label / rename input */}
              {renamingIdx === realIdx ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(obj)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(obj);
                    if (e.key === "Escape") setRenamingIdx(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 text-xs border border-blue-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-gray-800"
                />
              ) : (
                <span
                  className="flex-1 truncate text-xs"
                  onDoubleClick={(e) => startRename(realIdx, obj, e)}
                  title="Double-click to rename"
                >
                  {layerLabel(obj, realIdx)}
                </span>
              )}

              {/* Action buttons */}
              {renamingIdx !== realIdx && (
                <div className="flex gap-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {/* Lock */}
                  <button
                    onClick={(e) => toggleLock(obj, e)}
                    title={locked ? "Unlock" : "Lock"}
                    className={`w-5 h-5 flex items-center justify-center text-xs transition-colors ${
                      locked ? "text-amber-500 hover:text-amber-700" : "text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    {locked ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3">
                        <rect x="1.5" y="4.5" width="7" height="5" rx="0.5" />
                        <path d="M3 4.5V3a2 2 0 014 0v1.5" />
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3">
                        <rect x="1.5" y="4.5" width="7" height="5" rx="0.5" />
                        <path d="M3 4.5V3a2 2 0 014 0" />
                      </svg>
                    )}
                  </button>
                  {/* Duplicate */}
                  <button
                    onClick={(e) => duplicate(obj, e)}
                    title="Duplicate"
                    className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 text-xs"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                      <rect x="3" y="3" width="6.5" height="6.5" rx="0.8" />
                      <path d="M1.5 7V1.5H7" strokeLinecap="round" />
                    </svg>
                  </button>
                  {/* Move up */}
                  <button
                    onClick={(e) => moveUp(obj, e)}
                    title="Move up"
                    className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 text-xs"
                  >
                    ↑
                  </button>
                  {/* Move down */}
                  <button
                    onClick={(e) => moveDown(obj, e)}
                    title="Move down"
                    className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 text-xs"
                  >
                    ↓
                  </button>
                  {/* Delete */}
                  <button
                    onClick={(e) => remove(obj, e)}
                    title="Delete"
                    className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-600 text-xs"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Always-visible lock indicator */}
              {locked && renamingIdx !== realIdx && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" className="text-amber-400 flex-shrink-0">
                  <rect x="1.5" y="4.5" width="7" height="5" rx="0.5" />
                  <path d="M3 4.5V3a2 2 0 014 0v1.5" />
                </svg>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
