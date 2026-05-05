"use client";

import { useRef, useState, RefObject } from "react";
import * as fabric from "fabric";
import type { Canvas, Image as FabricImage } from "fabric";
import { exportToPDF } from "@/lib/exportPDF";
import { CANVAS_SIZES, type CanvasSize } from "./Editor";

const VARIABLES = [
  "name", "grade", "class", "rank", "school",
  "date", "result", "year", "semester", "gender",
];

interface Props {
  fabricRef: RefObject<Canvas | null>;
  ready: boolean;
  syncLayers: () => void;
  saveSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  canvasSize: CanvasSize;
  onCanvasSizeChange: (size: CanvasSize) => void;
  onSaveTemplate: () => void;
  onLoadTemplate: (file: File) => Promise<void>;
  onOpenBulk: () => void;
}

export default function Toolbar({
  fabricRef, ready, syncLayers, saveSnapshot,
  undo, redo,
  canvasSize, onCanvasSizeChange,
  onSaveTemplate, onLoadTemplate, onOpenBulk,
}: Props) {
  const frameRef = useRef<HTMLInputElement>(null);
  const watermarkRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const templateRef = useRef<HTMLInputElement>(null);
  const [showVars, setShowVars] = useState(false);
  const [showSizes, setShowSizes] = useState(false);

  const c = () => fabricRef.current;

  // ── Elements ────────────────────────────────────────────────
  const addText = () => {
    const canvas = c();
    if (!canvas) return;
    const text = new fabric.Textbox("Double click to edit", {
      left: canvas.getWidth() / 2 - 150,
      top: canvas.getHeight() / 2 - 20,
      width: 300,
      fontSize: 28,
      fontFamily: "Arial",
      fill: "#000000",
      textAlign: "center",
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
  };

  const insertVariable = (varName: string) => {
    const canvas = c();
    if (!canvas) return;
    setShowVars(false);
    const active = canvas.getActiveObject();

    if (active?.type === "textbox" || active?.type === "i-text") {
      const t = active as fabric.Textbox;
      const cur = t.text ?? "";
      t.set({ text: cur + `{{${varName}}}` });
      canvas.renderAll();
      saveSnapshot();
    } else {
      // Create a new text box with the variable
      const text = new fabric.Textbox(`{{${varName}}}`, {
        left: canvas.getWidth() / 2 - 80,
        top: canvas.getHeight() / 2 - 16,
        width: 200,
        fontSize: 28,
        fontFamily: "Arial",
        fill: "#000000",
        textAlign: "center",
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.renderAll();
    }
  };

  // ── Images ──────────────────────────────────────────────────
  const loadImg = async (file: File, cb: (img: FabricImage) => void) => {
    const url = URL.createObjectURL(file);
    const img = await fabric.Image.fromURL(url);
    cb(img);
    URL.revokeObjectURL(url);
  };

  const handleFrame = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const canvas = c();
    if (!file || !canvas) return;
    await loadImg(file, (img) => {
      img.set({ left: 0, top: 0 });
      img.scaleToWidth(canvas.getWidth());
      img.scaleToHeight(canvas.getHeight());
      (img as unknown as { data: { role: string } }).data = { role: "frame" };
      canvas.add(img);
      canvas.sendObjectToBack(img);
      canvas.renderAll();
      syncLayers();
    });
    e.target.value = "";
  };

  const handleWatermark = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const canvas = c();
    if (!file || !canvas) return;
    await loadImg(file, (img) => {
      const maxDim = 280;
      const scale = Math.min(maxDim / (img.width ?? 1), maxDim / (img.height ?? 1));
      img.set({
        left: canvas.getWidth() / 2 - ((img.width ?? 0) * scale) / 2,
        top: canvas.getHeight() / 2 - ((img.height ?? 0) * scale) / 2,
        scaleX: scale,
        scaleY: scale,
        opacity: 0.3,
      });
      (img as unknown as { data: { role: string } }).data = { role: "watermark" };
      canvas.add(img);
      canvas.renderAll();
      syncLayers();
    });
    e.target.value = "";
  };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const canvas = c();
    if (!file || !canvas) return;
    await loadImg(file, (img) => {
      const scale = Math.min(200 / (img.width ?? 1), 200 / (img.height ?? 1));
      img.set({ left: 80, top: 80, scaleX: scale, scaleY: scale });
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
      syncLayers();
    });
    e.target.value = "";
  };

  const handleClear = () => {
    const canvas = c();
    if (!canvas) return;
    if (!confirm("Clear all elements from the canvas?")) return;
    canvas.clear();
    canvas.backgroundColor = "#ffffff";
    canvas.renderAll();
    syncLayers();
    saveSnapshot();
  };

  const handleExport = async () => {
    const canvas = c();
    if (canvas) await exportToPDF(canvas);
  };

  const handleLoadTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await onLoadTemplate(file);
    e.target.value = "";
  };

  // ── Shared button styles ────────────────────────────────────
  const btn = "flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
  const iconBtn = "w-8 h-8 flex items-center justify-center rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const sep = <div className="h-5 w-px bg-gray-200 flex-shrink-0" />;

  return (
    <header className="flex items-center gap-1.5 px-4 py-2 bg-white border-b border-gray-200 shadow-sm flex-shrink-0 overflow-x-auto">
      {/* Brand */}
      <span className="font-bold text-blue-600 text-base tracking-tight mr-2 flex-shrink-0">CertGen</span>

      {sep}

      {/* Undo / Redo */}
      <button onClick={undo} disabled={!ready} title="Undo (⌘Z)" className={`${iconBtn} text-gray-500 hover:bg-gray-100`}>
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M3 7.5A4.5 4.5 0 117.5 12H4" />
          <path d="M3 4v3.5h3.5" />
        </svg>
      </button>
      <button onClick={redo} disabled={!ready} title="Redo (⌘Y)" className={`${iconBtn} text-gray-500 hover:bg-gray-100`}>
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M12 7.5A4.5 4.5 0 117.5 12H11" transform="scale(-1,1) translate(-15,0)" />
          <path d="M12 4v3.5H8.5" transform="scale(-1,1) translate(-15,0)" />
        </svg>
      </button>

      {sep}

      {/* Add Text */}
      <button onClick={addText} disabled={!ready} className={`${btn} bg-blue-50 text-blue-700 hover:bg-blue-100`}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
          <path d="M0.5 1.5h12v1.5H7.75V11H5.25V3H.5V1.5z" />
        </svg>
        Text
      </button>

      {/* Add Image */}
      <button onClick={() => imageRef.current?.click()} disabled={!ready} className={`${btn} bg-gray-50 text-gray-700 hover:bg-gray-100`}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="0.5" y="0.5" width="12" height="12" rx="1.5" />
          <circle cx="4" cy="4" r="1" fill="currentColor" stroke="none" />
          <path d="M0.5 9.5l3-3L6 9l2.5-3L12.5 9.5" />
        </svg>
        Image
      </button>
      <input ref={imageRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />

      {sep}

      {/* Frame */}
      <button onClick={() => frameRef.current?.click()} disabled={!ready} className={`${btn} bg-amber-50 text-amber-700 hover:bg-amber-100`}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="0.5" y="0.5" width="12" height="12" rx="1.5" />
          <rect x="3" y="3" width="7" height="7" rx="1" />
        </svg>
        Frame
      </button>
      <input ref={frameRef} type="file" accept="image/*" onChange={handleFrame} className="hidden" />

      {/* Watermark */}
      <button onClick={() => watermarkRef.current?.click()} disabled={!ready} className={`${btn} bg-purple-50 text-purple-700 hover:bg-purple-100`}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M6.5 1C6.5 1 3 4.5 3 7.5a3.5 3.5 0 007 0C10 4.5 6.5 1 6.5 1z" />
        </svg>
        Watermark
      </button>
      <input ref={watermarkRef} type="file" accept="image/*" onChange={handleWatermark} className="hidden" />

      {sep}

      {/* Variables popover */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => { setShowVars((v) => !v); setShowSizes(false); }}
          disabled={!ready}
          className={`${btn} bg-yellow-50 text-yellow-700 hover:bg-yellow-100`}
        >
          <span className="font-mono text-xs">{"{ }"}</span>
          Variables
        </button>

        {showVars && (
          <div className="absolute top-full left-0 mt-1 z-40 bg-white rounded-xl shadow-xl border border-gray-100 p-3 w-56">
            <p className="text-xs text-gray-400 mb-2">Click to insert into selected text or create new</p>
            <div className="grid grid-cols-2 gap-1">
              {VARIABLES.map((v) => (
                <button
                  key={v}
                  onClick={() => insertVariable(v)}
                  className="text-left px-2 py-1.5 text-xs font-mono bg-yellow-50 hover:bg-yellow-100 text-yellow-800 rounded-md transition-colors truncate"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowVars(false)}
              className="mt-2 w-full text-xs text-gray-400 hover:text-gray-600 py-1"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {sep}

      {/* Canvas size */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => { setShowSizes((v) => !v); setShowVars(false); }}
          disabled={!ready}
          className={`${btn} bg-gray-50 text-gray-700 hover:bg-gray-100`}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="0.5" y="2" width="12" height="9" rx="1" />
            <path d="M3.5 5h6M3.5 8h4" strokeLinecap="round" />
          </svg>
          {canvasSize.label}
        </button>

        {showSizes && (
          <div className="absolute top-full left-0 mt-1 z-40 bg-white rounded-xl shadow-xl border border-gray-100 py-1 w-44">
            {CANVAS_SIZES.map((s) => (
              <button
                key={s.label}
                onClick={() => { onCanvasSizeChange(s); setShowSizes(false); }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  s.label === canvasSize.label
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {s.label}
                <span className="block text-xs text-gray-400">{s.width} × {s.height}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {sep}

      {/* Save / Load template */}
      <button onClick={onSaveTemplate} disabled={!ready} className={`${btn} text-gray-600 hover:bg-gray-100`}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M2 10.5V11.5a1 1 0 001 1h7a1 1 0 001-1V10.5" />
          <path d="M6.5 1v7M3.5 5l3 3 3-3" />
        </svg>
        Save
      </button>

      <button onClick={() => templateRef.current?.click()} disabled={!ready} className={`${btn} text-gray-600 hover:bg-gray-100`}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M2 2.5V1.5a1 1 0 011-1h7a1 1 0 011 1v1" />
          <path d="M6.5 12V5M3.5 8l3-3 3 3" />
        </svg>
        Load
      </button>
      <input ref={templateRef} type="file" accept=".json,application/json" onChange={handleLoadTemplate} className="hidden" />

      <div className="flex-1" />

      {/* Clear */}
      <button onClick={handleClear} disabled={!ready} className={`${btn} text-red-500 hover:bg-red-50`}>
        Clear
      </button>

      {sep}

      {/* Export single */}
      <button onClick={handleExport} disabled={!ready} className={`${btn} bg-green-600 text-white hover:bg-green-700`}>
        Export PDF
      </button>

      {/* Bulk */}
      <button onClick={onOpenBulk} disabled={!ready} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M1.5 3h10M1.5 6.5h10M1.5 10h6" />
        </svg>
        Bulk Export
      </button>
    </header>
  );
}
