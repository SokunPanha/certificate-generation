"use client";

import { RefObject } from "react";
import type { Canvas, Object as FabricObject, Textbox } from "fabric";

interface Props {
  layers: FabricObject[];
  fabricRef: RefObject<Canvas | null>;
  activeObject: FabricObject | null;
  setActiveObject: (obj: FabricObject | null) => void;
  syncLayers: () => void;
}

function layerLabel(obj: FabricObject, index: number): string {
  const role = (obj as unknown as { data?: { role?: string } }).data?.role;
  if (role === "watermark") return "💧 Watermark";
  if (role === "frame") return "🖼 Frame";
  if (obj.type === "textbox" || obj.type === "i-text" || obj.type === "text") {
    const text = ((obj as Textbox).text ?? "").slice(0, 22);
    return `T  ${text}`;
  }
  if (obj.type === "image") return `🖼 Image ${index + 1}`;
  return `Layer ${index + 1}`;
}

export default function LayersPanel({
  layers,
  fabricRef,
  activeObject,
  setActiveObject,
  syncLayers,
}: Props) {
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

  // Show top layers first
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

          return (
            <div
              key={realIdx}
              onClick={() => select(obj)}
              className={`flex items-center gap-1.5 px-3 py-2 cursor-pointer border-b border-gray-50 group transition-colors text-sm ${
                isActive
                  ? "bg-blue-50 text-blue-800"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="flex-1 truncate text-xs">
                {layerLabel(obj, realIdx)}
              </span>

              <div className="flex gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => moveUp(obj, e)}
                  title="Move up"
                  className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 text-xs"
                >
                  ↑
                </button>
                <button
                  onClick={(e) => moveDown(obj, e)}
                  title="Move down"
                  className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 text-xs"
                >
                  ↓
                </button>
                <button
                  onClick={(e) => remove(obj, e)}
                  title="Delete"
                  className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-600 text-xs"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
