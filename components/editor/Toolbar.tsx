"use client";

import { useRef, useState, useEffect, RefObject } from "react";
import { createPortal } from "react-dom";
import * as fabric from "fabric";
import type { Canvas, Image as FabricImage, Object as FabricObject } from "fabric";
import { exportToPDF } from "@/lib/exportPDF";
import { CANVAS_SIZES, type CanvasSize } from "./Editor";
import { HexColorPicker } from "react-colorful";

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
  bgColor: string;
  onBgColorChange: (color: string) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  previewMode: boolean;
  onPreviewToggle: () => void;
  activeObject: FabricObject | null;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onExportImage: (format: "png" | "jpeg") => void;
  onSaveTemplate: () => void;
  onLoadTemplate: (file: File) => Promise<void>;
  onOpenBulk: () => void;
  onOpenTemplates: () => void;
  lastSaved: Date | null;
}

type PopoverPos = { top: number; left: number } | null;

function timeSince(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function Toolbar({
  fabricRef, ready, syncLayers, saveSnapshot,
  undo, redo,
  canvasSize, onCanvasSizeChange,
  bgColor, onBgColorChange,
  zoom, onZoomChange,
  previewMode, onPreviewToggle,
  activeObject, onGroupSelected, onUngroupSelected,
  onExportImage,
  onSaveTemplate, onLoadTemplate, onOpenBulk, onOpenTemplates,
  lastSaved,
}: Props) {
  const frameRef = useRef<HTMLInputElement>(null);
  const watermarkRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const templateRef = useRef<HTMLInputElement>(null);

  const [varsPos, setVarsPos] = useState<PopoverPos>(null);
  const [sizesPos, setSizesPos] = useState<PopoverPos>(null);
  const [shapesPos, setShapesPos] = useState<PopoverPos>(null);
  const [bgPos, setBgPos] = useState<PopoverPos>(null);
  const [exportPos, setExportPos] = useState<PopoverPos>(null);
  const [qrPos, setQrPos] = useState<PopoverPos>(null);
  const [qrUrl, setQrUrl] = useState("https://");
  const [qrLoading, setQrLoading] = useState(false);

  // Tick for "last saved X min ago"
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const closeAll = () => {
    setVarsPos(null); setSizesPos(null); setShapesPos(null);
    setBgPos(null); setExportPos(null); setQrPos(null);
  };

  useEffect(() => {
    const anyOpen = varsPos || sizesPos || shapesPos || bgPos || exportPos || qrPos;
    if (!anyOpen) return;
    const close = () => closeAll();
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [varsPos, sizesPos, shapesPos, bgPos, exportPos, qrPos]);

  const popoverBtn = (
    pos: PopoverPos,
    setPos: (p: PopoverPos) => void,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    closeAll();
    setPos(pos ? null : { top: r.bottom + 4, left: r.left });
  };

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

  const addShape = (type: "rect" | "circle" | "line") => {
    const canvas = c();
    if (!canvas) return;
    closeAll();
    const cx = canvas.getWidth() / 2;
    const cy = canvas.getHeight() / 2;
    let obj: FabricObject;
    if (type === "rect") {
      obj = new fabric.Rect({ left: cx - 80, top: cy - 50, width: 160, height: 100, fill: "transparent", stroke: "#000000", strokeWidth: 2 });
    } else if (type === "circle") {
      obj = new fabric.Circle({ left: cx - 60, top: cy - 60, radius: 60, fill: "transparent", stroke: "#000000", strokeWidth: 2 });
    } else {
      obj = new fabric.Line([cx - 80, cy, cx + 80, cy], { stroke: "#000000", strokeWidth: 2 });
    }
    canvas.add(obj);
    canvas.setActiveObject(obj);
    canvas.renderAll();
  };

  const addQRCode = async () => {
    const canvas = c();
    if (!canvas || !qrUrl.trim()) return;
    setQrLoading(true);
    try {
      const QRCode = (await import("qrcode")).default;
      const dataURL = await QRCode.toDataURL(qrUrl, { width: 200, margin: 1 });
      const img = await fabric.Image.fromURL(dataURL);
      const size = Math.min(canvas.getWidth(), canvas.getHeight()) * 0.2;
      const scale = size / (img.width ?? 200);
      img.set({
        left: canvas.getWidth() / 2 - size / 2,
        top: canvas.getHeight() / 2 - size / 2,
        scaleX: scale,
        scaleY: scale,
      });
      (img as unknown as { data: { role: string; qrText: string } }).data = {
        role: "qr",
        qrText: qrUrl,
      };
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
      syncLayers();
      closeAll();
    } finally {
      setQrLoading(false);
    }
  };

  const insertVariable = (varName: string) => {
    const canvas = c();
    if (!canvas) return;
    setVarsPos(null);
    const active = canvas.getActiveObject();
    if (active?.type === "textbox" || active?.type === "i-text") {
      const t = active as fabric.Textbox;
      t.set({ text: (t.text ?? "") + `{{${varName}}}` });
      canvas.renderAll();
      saveSnapshot();
    } else {
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

  const handleExportPDF = async () => {
    const canvas = c();
    if (canvas) await exportToPDF(canvas);
    closeAll();
  };

  const handleLoadTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await onLoadTemplate(file);
    e.target.value = "";
  };

  const canGroup = activeObject?.type === "activeSelection";
  const canUngroup = activeObject?.type === "group";

  // ── Shared button styles ────────────────────────────────────
  const btn = "flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
  const iconBtn = "w-8 h-8 flex items-center justify-center rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const sep = <div className="h-5 w-px bg-gray-200 flex-shrink-0" />;

  const zoomPct = Math.round(zoom * 100);

  return (
    <header className="flex items-center gap-1.5 px-4 py-2 bg-white border-b border-gray-200 shadow-sm flex-shrink-0 flex-wrap">
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

      {/* Text */}
      <button onClick={addText} disabled={!ready} className={`${btn} bg-blue-50 text-blue-700 hover:bg-blue-100`}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
          <path d="M0.5 1.5h12v1.5H7.75V11H5.25V3H.5V1.5z" />
        </svg>
        Text
      </button>

      {/* Image */}
      <button onClick={() => imageRef.current?.click()} disabled={!ready} className={`${btn} bg-gray-50 text-gray-700 hover:bg-gray-100`}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="0.5" y="0.5" width="12" height="12" rx="1.5" />
          <circle cx="4" cy="4" r="1" fill="currentColor" stroke="none" />
          <path d="M0.5 9.5l3-3L6 9l2.5-3L12.5 9.5" />
        </svg>
        Image
      </button>
      <input ref={imageRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />

      {/* Shapes */}
      <div className="flex-shrink-0">
        <button
          onClick={(e) => popoverBtn(shapesPos, setShapesPos, e)}
          disabled={!ready}
          className={`${btn} bg-gray-50 text-gray-700 hover:bg-gray-100`}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="1" y="4" width="5" height="5" rx="0.5" />
            <circle cx="10" cy="4" r="2.5" />
            <path d="M1 12h11" strokeLinecap="round" />
          </svg>
          Shapes
        </button>
      </div>

      {shapesPos && createPortal(
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: shapesPos.top, left: shapesPos.left, zIndex: 9999 }}
          className="bg-white rounded-xl shadow-xl border border-gray-100 py-1 w-40"
        >
          {[
            { type: "rect" as const, label: "Rectangle", icon: <rect x="2" y="3" width="12" height="8" rx="1" /> },
            { type: "circle" as const, label: "Circle", icon: <circle cx="8" cy="7" r="5" /> },
            { type: "line" as const, label: "Line", icon: <path d="M2 8h12" strokeLinecap="round" /> },
          ].map(({ type, label, icon }) => (
            <button
              key={type}
              onClick={() => addShape(type)}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                {icon}
              </svg>
              {label}
            </button>
          ))}
        </div>,
        document.body
      )}

      {/* QR Code */}
      <div className="flex-shrink-0">
        <button
          onClick={(e) => popoverBtn(qrPos, setQrPos, e)}
          disabled={!ready}
          className={`${btn} bg-gray-50 text-gray-700 hover:bg-gray-100`}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="0.5" y="0.5" width="5" height="5" rx="0.5" />
            <rect x="7.5" y="0.5" width="5" height="5" rx="0.5" />
            <rect x="0.5" y="7.5" width="5" height="5" rx="0.5" />
            <rect x="2" y="2" width="2" height="2" fill="currentColor" stroke="none" />
            <rect x="9" y="2" width="2" height="2" fill="currentColor" stroke="none" />
            <rect x="2" y="9" width="2" height="2" fill="currentColor" stroke="none" />
            <path d="M7.5 7.5h2v2M9.5 9.5h3v3M7.5 10.5v2" strokeLinecap="round" />
          </svg>
          QR Code
        </button>
      </div>

      {qrPos && createPortal(
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: qrPos.top, left: qrPos.left, zIndex: 9999 }}
          className="bg-white rounded-xl shadow-xl border border-gray-100 p-4 w-72"
        >
          <p className="text-xs text-gray-500 mb-2 font-medium">QR Code URL</p>
          <p className="text-xs text-gray-400 mb-2 leading-tight">
            You can use variables like <span className="font-mono">{"{{name}}"}</span> — each bulk export row will get its own QR.
          </p>
          <input
            type="text"
            value={qrUrl}
            onChange={(e) => setQrUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addQRCode(); }}
            placeholder="https://example.com/verify/{{name}}"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={addQRCode}
            disabled={qrLoading || !qrUrl.trim()}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
          >
            {qrLoading ? "Generating…" : "Add QR Code"}
          </button>
        </div>,
        document.body
      )}

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

      {/* Variables */}
      <div className="flex-shrink-0">
        <button
          onClick={(e) => popoverBtn(varsPos, setVarsPos, e)}
          disabled={!ready}
          className={`${btn} bg-yellow-50 text-yellow-700 hover:bg-yellow-100`}
        >
          <span className="font-mono text-xs">{"{ }"}</span>
          Variables
        </button>
      </div>

      {varsPos && createPortal(
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: varsPos.top, left: varsPos.left, zIndex: 9999 }}
          className="bg-white rounded-xl shadow-xl border border-gray-100 p-3 w-56"
        >
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
        </div>,
        document.body
      )}

      {/* Preview toggle */}
      <button
        onClick={onPreviewToggle}
        disabled={!ready}
        title="Preview variables with sample data"
        className={`${btn} transition-colors ${
          previewMode
            ? "bg-amber-500 text-white hover:bg-amber-600"
            : "bg-gray-50 text-gray-700 hover:bg-gray-100"
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3">
          <ellipse cx="6.5" cy="6.5" rx="6" ry="3.5" />
          <circle cx="6.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
        </svg>
        Preview
      </button>

      {sep}

      {/* Canvas size */}
      <div className="flex-shrink-0">
        <button
          onClick={(e) => popoverBtn(sizesPos, setSizesPos, e)}
          disabled={!ready}
          className={`${btn} bg-gray-50 text-gray-700 hover:bg-gray-100`}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="0.5" y="2" width="12" height="9" rx="1" />
            <path d="M3.5 5h6M3.5 8h4" strokeLinecap="round" />
          </svg>
          {canvasSize.label}
        </button>
      </div>

      {sizesPos && createPortal(
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: sizesPos.top, left: sizesPos.left, zIndex: 9999 }}
          className="bg-white rounded-xl shadow-xl border border-gray-100 py-1 w-44"
        >
          {CANVAS_SIZES.map((s) => (
            <button
              key={s.label}
              onClick={() => { onCanvasSizeChange(s); setSizesPos(null); }}
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
        </div>,
        document.body
      )}

      {/* Background color */}
      <div className="flex-shrink-0">
        <button
          onClick={(e) => popoverBtn(bgPos, setBgPos, e)}
          disabled={!ready}
          title="Canvas background color"
          className={`${btn} bg-gray-50 text-gray-700 hover:bg-gray-100`}
        >
          <span
            className="w-4 h-4 rounded border border-gray-300 flex-shrink-0"
            style={{ backgroundColor: bgColor }}
          />
          BG
        </button>
      </div>

      {bgPos && createPortal(
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: bgPos.top, left: bgPos.left, zIndex: 9999 }}
          className="bg-white rounded-xl shadow-xl border border-gray-100 p-3 space-y-2"
        >
          <p className="text-xs text-gray-500 font-medium">Canvas Background</p>
          <HexColorPicker color={bgColor} onChange={onBgColorChange} />
          <input
            type="text"
            value={bgColor}
            onChange={(e) => onBgColorChange(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="flex gap-1">
            {["#ffffff", "#000000", "#f8f4ee", "#1e3a5f", "#e8f4e8"].map((c) => (
              <button
                key={c}
                onClick={() => onBgColorChange(c)}
                title={c}
                style={{ backgroundColor: c }}
                className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
              />
            ))}
          </div>
        </div>,
        document.body
      )}

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

      <button onClick={onOpenTemplates} disabled={!ready} className={`${btn} text-indigo-600 hover:bg-indigo-50`}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <rect x="1" y="1" width="4.5" height="4.5" rx="0.7" />
          <rect x="7.5" y="1" width="4.5" height="4.5" rx="0.7" />
          <rect x="1" y="7.5" width="4.5" height="4.5" rx="0.7" />
          <rect x="7.5" y="7.5" width="4.5" height="4.5" rx="0.7" />
        </svg>
        Templates
      </button>

      {/* Last saved indicator */}
      {lastSaved && (
        <span className="text-xs text-gray-400 flex-shrink-0 ml-1">
          ✓ {timeSince(lastSaved)}
        </span>
      )}

      <div className="flex-1" />

      {/* Group / Ungroup */}
      {(canGroup || canUngroup) && (
        <>
          {canGroup && (
            <button
              onClick={onGroupSelected}
              className={`${btn} bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}
              title="Group selected (⌘G)"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3">
                <rect x="0.5" y="0.5" width="5" height="5" rx="0.5" />
                <rect x="7.5" y="7.5" width="5" height="5" rx="0.5" />
                <rect x="0.5" y="7.5" width="5" height="5" rx="0.5" />
                <rect x="7.5" y="0.5" width="5" height="5" rx="0.5" />
              </svg>
              Group
            </button>
          )}
          {canUngroup && (
            <button
              onClick={onUngroupSelected}
              className={`${btn} bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}
              title="Ungroup (⌘G)"
            >
              Ungroup
            </button>
          )}
          {sep}
        </>
      )}

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={() => onZoomChange(zoom - 0.1)}
          disabled={!ready}
          title="Zoom out (⌘−)"
          className={`${iconBtn} text-gray-600 hover:bg-gray-100 text-base font-light`}
        >
          −
        </button>
        <button
          onClick={() => onZoomChange(1)}
          disabled={!ready}
          title="Reset zoom (⌘0)"
          className="px-2 h-8 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors min-w-[3.5rem] text-center"
        >
          {zoomPct}%
        </button>
        <button
          onClick={() => onZoomChange(zoom + 0.1)}
          disabled={!ready}
          title="Zoom in (⌘+)"
          className={`${iconBtn} text-gray-600 hover:bg-gray-100 text-base font-light`}
        >
          +
        </button>
      </div>

      {sep}

      {/* Clear */}
      <button onClick={handleClear} disabled={!ready} className={`${btn} text-red-500 hover:bg-red-50`}>
        Clear
      </button>

      {sep}

      {/* Export */}
      <div className="flex-shrink-0">
        <button
          onClick={(e) => popoverBtn(exportPos, setExportPos, e)}
          disabled={!ready}
          className={`${btn} bg-green-600 text-white hover:bg-green-700`}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M2 10.5V11.5a1 1 0 001 1h7a1 1 0 001-1V10.5" />
            <path d="M6.5 1v7M3.5 5l3 3 3-3" />
          </svg>
          Export
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M2 3.5l2.5 2.5 2.5-2.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {exportPos && createPortal(
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: exportPos.top, left: exportPos.left, zIndex: 9999 }}
          className="bg-white rounded-xl shadow-xl border border-gray-100 py-1 w-40"
        >
          {[
            { label: "Export PDF", action: handleExportPDF },
            { label: "Export PNG", action: () => { onExportImage("png"); closeAll(); } },
            { label: "Export JPG", action: () => { onExportImage("jpeg"); closeAll(); } },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>,
        document.body
      )}

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
