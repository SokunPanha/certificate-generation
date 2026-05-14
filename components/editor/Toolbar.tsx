"use client";

import { useRef, useState, useEffect, RefObject, ReactNode } from "react";
import { createPortal } from "react-dom";
import * as fabric from "fabric";
import type { Canvas, Image as FabricImage, Object as FabricObject } from "fabric";
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
  xlsxRows: Record<string, string>[] | null;
  xlsxRowIdx: number;
  onXlsxLoad: (rows: Record<string, string>[]) => void;
  activeObject: FabricObject | null;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onOpenExport: () => void;
  onSaveTemplate: () => void;
  onLoadTemplate: (file: File) => Promise<void>;
  onOpenBulk: () => void;
  onOpenTemplates: () => void;
  lastSaved: Date | null;
}

type PopoverPos = { top: number; left: number } | null;

// ── Ribbon primitives ────────────────────────────────────────────────────────

function RibbonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col border-r border-gray-200 last:border-r-0 h-full flex-shrink-0">
      <div className="flex items-center gap-0.5 px-2 pt-1.5 flex-1">
        {children}
      </div>
      <div className="text-[9px] text-gray-400 text-center pb-1 px-1 leading-none tracking-wide uppercase">
        {label}
      </div>
    </div>
  );
}

interface RibbonBtnProps {
  icon: ReactNode;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  color?: "default" | "blue" | "green" | "amber" | "purple" | "red" | "indigo";
}

const colorMap = {
  default: "text-gray-700 hover:bg-gray-100",
  blue:    "text-blue-700 hover:bg-blue-50",
  green:   "text-green-700 hover:bg-green-50",
  amber:   "text-amber-700 hover:bg-amber-50",
  purple:  "text-purple-700 hover:bg-purple-50",
  red:     "text-red-600 hover:bg-red-50",
  indigo:  "text-indigo-700 hover:bg-indigo-50",
};

function RibbonBtn({ icon, label, onClick, disabled, active, title, color = "default" }: RibbonBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex flex-col items-center justify-center gap-1 w-12 rounded-md py-1.5 text-[10px] font-medium leading-none transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap select-none
        ${active ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : colorMap[color]}`}
    >
      <span className="flex items-center justify-center w-5 h-5">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// Dropdown ribbon button (shows a small chevron)
interface RibbonDropBtnProps extends RibbonBtnProps {
  open?: boolean;
}
function RibbonDropBtn({ icon, label, onClick, disabled, active, title, color = "default", open }: RibbonDropBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex flex-col items-center justify-center gap-1 w-14 rounded-md py-1.5 text-[10px] font-medium leading-none transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap select-none
        ${active || open ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : colorMap[color]}`}
    >
      <span className="flex items-center justify-center w-5 h-5">{icon}</span>
      <span className="flex items-center gap-0.5">
        {label}
        <svg width="7" height="7" viewBox="0 0 7 7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M1 2.5l2.5 2 2.5-2" />
        </svg>
      </span>
    </button>
  );
}

function timeSince(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ── Main component ───────────────────────────────────────────────────────────

async function parseXLSX(file: File): Promise<Record<string, string>[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: "" });
  const headers = raw.length ? Object.keys(raw[0]) : [];
  return raw.map((r) =>
    Object.fromEntries(headers.map((h) => [h, String(r[h] ?? "")])) as Record<string, string>
  );
}

export default function Toolbar({
  fabricRef, ready, syncLayers, saveSnapshot,
  undo, redo,
  canvasSize, onCanvasSizeChange,
  bgColor, onBgColorChange,
  zoom, onZoomChange,
  previewMode, onPreviewToggle,
  xlsxRows, xlsxRowIdx, onXlsxLoad,
  activeObject, onGroupSelected, onUngroupSelected,
  onOpenExport,
  onSaveTemplate, onLoadTemplate, onOpenBulk, onOpenTemplates,
  lastSaved,
}: Props) {
  const frameRef    = useRef<HTMLInputElement>(null);
  const watermarkRef = useRef<HTMLInputElement>(null);
  const imageRef    = useRef<HTMLInputElement>(null);
  const templateRef = useRef<HTMLInputElement>(null);
  const xlsxRef     = useRef<HTMLInputElement>(null);

  const [varsPos,   setVarsPos]   = useState<PopoverPos>(null);
  const [sizesPos,  setSizesPos]  = useState<PopoverPos>(null);
  const [shapesPos, setShapesPos] = useState<PopoverPos>(null);
  const [bgPos,     setBgPos]     = useState<PopoverPos>(null);
  const [qrPos,     setQrPos]     = useState<PopoverPos>(null);
  const [qrUrl,     setQrUrl]     = useState("https://");
  const [qrLoading, setQrLoading] = useState(false);

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const closeAll = () => {
    setVarsPos(null); setSizesPos(null); setShapesPos(null);
    setBgPos(null); setQrPos(null);
  };

  useEffect(() => {
    const anyOpen = varsPos || sizesPos || shapesPos || bgPos || qrPos;
    if (!anyOpen) return;
    const close = () => closeAll();
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [varsPos, sizesPos, shapesPos, bgPos, qrPos]);

  const openPopover = (cur: PopoverPos, set: (p: PopoverPos) => void, e: React.MouseEvent) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    closeAll();
    set(cur ? null : { top: r.bottom + 4, left: r.left });
  };

  const c = () => fabricRef.current;

  // ── Element adders ───────────────────────────────────────────────────────

  const addText = () => {
    const canvas = c(); if (!canvas) return;
    const text = new fabric.Textbox("Double click to edit", {
      left: canvas.getWidth() / 2 - 150, top: canvas.getHeight() / 2 - 20,
      width: 300, fontSize: 28, fontFamily: "Arial", fill: "#000000", textAlign: "center",
    });
    canvas.add(text); canvas.setActiveObject(text); canvas.renderAll();
  };

  const addShape = (type: "rect" | "circle" | "line") => {
    const canvas = c(); if (!canvas) return;
    closeAll();
    const cx = canvas.getWidth() / 2, cy = canvas.getHeight() / 2;
    let obj: FabricObject;
    if (type === "rect") {
      obj = new fabric.Rect({ left: cx - 80, top: cy - 50, width: 160, height: 100, fill: "transparent", stroke: "#000000", strokeWidth: 2 });
    } else if (type === "circle") {
      obj = new fabric.Circle({ left: cx - 60, top: cy - 60, radius: 60, fill: "transparent", stroke: "#000000", strokeWidth: 2 });
    } else {
      obj = new fabric.Line([cx - 80, cy, cx + 80, cy], { stroke: "#000000", strokeWidth: 2 });
    }
    canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll();
  };

  const addQRCode = async () => {
    const canvas = c(); if (!canvas || !qrUrl.trim()) return;
    setQrLoading(true);
    try {
      const QRCode = (await import("qrcode")).default;
      const dataURL = await QRCode.toDataURL(qrUrl, { width: 200, margin: 1 });
      const img = await fabric.Image.fromURL(dataURL);
      const size = Math.min(canvas.getWidth(), canvas.getHeight()) * 0.2;
      const scale = size / (img.width ?? 200);
      img.set({ left: canvas.getWidth() / 2 - size / 2, top: canvas.getHeight() / 2 - size / 2, scaleX: scale, scaleY: scale });
      (img as unknown as { data: { role: string; qrText: string } }).data = { role: "qr", qrText: qrUrl };
      canvas.add(img); canvas.setActiveObject(img); canvas.renderAll(); syncLayers(); closeAll();
    } finally { setQrLoading(false); }
  };

  const insertVariable = (varName: string) => {
    const canvas = c(); if (!canvas) return;
    setVarsPos(null);
    const active = canvas.getActiveObject();
    if (active?.type === "textbox" || active?.type === "i-text") {
      const t = active as fabric.Textbox;
      t.set({ text: (t.text ?? "") + `{{${varName}}}` });
      canvas.renderAll(); saveSnapshot();
    } else {
      const text = new fabric.Textbox(`{{${varName}}}`, {
        left: canvas.getWidth() / 2 - 80, top: canvas.getHeight() / 2 - 16,
        width: 200, fontSize: 28, fontFamily: "Arial", fill: "#000000", textAlign: "center",
      });
      canvas.add(text); canvas.setActiveObject(text); canvas.renderAll();
    }
  };

  const loadImg = async (file: File, cb: (img: FabricImage) => void) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target!.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const img = await fabric.Image.fromURL(dataUrl);
    cb(img);
  };

  const handleFrame = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; const canvas = c();
    if (!file || !canvas) return;
    await loadImg(file, (img) => {
      img.set({ left: 0, top: 0 });
      img.scaleToWidth(canvas.getWidth()); img.scaleToHeight(canvas.getHeight());
      (img as unknown as { data: { role: string } }).data = { role: "frame" };
      canvas.add(img); canvas.sendObjectToBack(img); canvas.renderAll(); syncLayers();
    });
    e.target.value = "";
  };

  const handleWatermark = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; const canvas = c();
    if (!file || !canvas) return;
    await loadImg(file, (img) => {
      const maxDim = 280;
      const scale = Math.min(maxDim / (img.width ?? 1), maxDim / (img.height ?? 1));
      img.set({
        left: canvas.getWidth() / 2 - ((img.width ?? 0) * scale) / 2,
        top: canvas.getHeight() / 2 - ((img.height ?? 0) * scale) / 2,
        scaleX: scale, scaleY: scale, opacity: 0.3,
      });
      (img as unknown as { data: { role: string } }).data = { role: "watermark" };
      canvas.add(img); canvas.renderAll(); syncLayers();
    });
    e.target.value = "";
  };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; const canvas = c();
    if (!file || !canvas) return;
    await loadImg(file, (img) => {
      const scale = Math.min(200 / (img.width ?? 1), 200 / (img.height ?? 1));
      img.set({ left: 80, top: 80, scaleX: scale, scaleY: scale });
      canvas.add(img); canvas.setActiveObject(img); canvas.renderAll(); syncLayers();
    });
    e.target.value = "";
  };

  const handleXlsxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseXLSX(file);
      if (rows.length) onXlsxLoad(rows);
    } catch { /* ignore invalid files */ }
    e.target.value = "";
  };

  const handleClear = () => {
    const canvas = c(); if (!canvas) return;
    if (!confirm("Clear all elements from the canvas?")) return;
    canvas.clear(); canvas.backgroundColor = "#ffffff"; canvas.renderAll();
    syncLayers(); saveSnapshot();
  };

  const handleLoadTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) await onLoadTemplate(file); e.target.value = "";
  };

  const canGroup   = activeObject?.type === "activeSelection";
  const canUngroup = activeObject?.type === "group";
  const zoomPct    = Math.round(zoom * 100);

  // ── SVG icons ────────────────────────────────────────────────────────────

  const icons = {
    undo:      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-5 h-5"><path d="M3.5 8A4.5 4.5 0 118 12.5H4.5"/><path d="M3.5 4.5v4H7.5"/></svg>,
    redo:      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-5 h-5"><path d="M12.5 8A4.5 4.5 0 118 12.5H11.5" transform="scale(-1,1) translate(-16,0)"/><path d="M12.5 4.5v4H8.5" transform="scale(-1,1) translate(-16,0)"/></svg>,
    text:      <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5"><path d="M1 2h14v2H9.5v10h-3V4H1V2z"/></svg>,
    image:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-5 h-5"><rect x="1" y="1" width="14" height="14" rx="1.5"/><circle cx="5" cy="5" r="1.5" fill="currentColor" stroke="none"/><path d="M1 11.5l4-4 3 3 2.5-3 4.5 4"/></svg>,
    shapes:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-5 h-5"><rect x="1" y="5" width="6" height="6" rx="0.5"/><circle cx="12" cy="5" r="3"/><path d="M1 15h14" strokeLinecap="round"/></svg>,
    qr:        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className="w-5 h-5"><rect x="1" y="1" width="6" height="6" rx="0.5"/><rect x="9" y="1" width="6" height="6" rx="0.5"/><rect x="1" y="9" width="6" height="6" rx="0.5"/><rect x="2.5" y="2.5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="10.5" y="2.5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="2.5" y="10.5" width="3" height="3" fill="currentColor" stroke="none"/><path d="M9 9h2.5v2.5M11.5 11.5H15v4M9 13v3" strokeLinecap="round"/></svg>,
    frame:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-5 h-5"><rect x="1" y="1" width="14" height="14" rx="1"/><rect x="4" y="4" width="8" height="8" rx="0.5"/></svg>,
    watermark: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-5 h-5"><path d="M8 1.5S4 6 4 9.5a4 4 0 008 0C12 6 8 1.5 8 1.5z"/></svg>,
    variable:  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-5 h-5"><path d="M5 4L2 8l3 4M11 4l3 4-3 4M9 3l-2 10"/></svg>,
    xlsx:      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="w-5 h-5"><rect x="1" y="2" width="14" height="12" rx="1.2"/><path d="M1 6h14"/><path d="M5.5 9.5l1.5 2M7 9.5l-1.5 2M9 9.5v2M9 9.5h2M9 11h1.5" strokeLinejoin="round"/></svg>,
    preview:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-5 h-5"><ellipse cx="8" cy="8" rx="7" ry="5"/><circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none"/></svg>,
    size:      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-5 h-5"><rect x="1" y="3" width="14" height="10" rx="1"/><path d="M4 7h8M4 10h5" strokeLinecap="round"/></svg>,
    bg:        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-5 h-5"><rect x="1" y="1" width="14" height="14" rx="1.5"/><rect x="3" y="3" width="10" height="10" rx="0.5" fill="currentColor" opacity="0.15" stroke="none"/></svg>,
    save:      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="w-5 h-5"><path d="M2 13V14a1 1 0 001 1h10a1 1 0 001-1V13"/><path d="M8 1v8M5 6l3 3 3-3"/></svg>,
    load:      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="w-5 h-5"><path d="M2 3V2a1 1 0 011-1h10a1 1 0 011 1v1"/><path d="M8 15V7M5 10l3-3 3 3"/></svg>,
    library:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="w-5 h-5"><rect x="1" y="1" width="6" height="6" rx="0.7"/><rect x="9" y="1" width="6" height="6" rx="0.7"/><rect x="1" y="9" width="6" height="6" rx="0.7"/><rect x="9" y="9" width="6" height="6" rx="0.7"/></svg>,
    export:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="w-5 h-5"><path d="M2 13V14a1 1 0 001 1h10a1 1 0 001-1V13"/><path d="M8 1v8M5 6l3 3 3-3"/></svg>,
    bulk:      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="w-5 h-5"><path d="M2 4h12M2 8h12M2 12h8"/></svg>,
    clear:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="w-5 h-5"><path d="M2 2l12 12M14 2L2 14"/></svg>,
    group:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-5 h-5"><rect x="1" y="1" width="6" height="6" rx="0.5"/><rect x="9" y="1" width="6" height="6" rx="0.5"/><rect x="1" y="9" width="6" height="6" rx="0.5"/><rect x="9" y="9" width="6" height="6" rx="0.5"/><rect x="3" y="3" width="10" height="10" rx="1" strokeDasharray="2 1.5"/></svg>,
    ungroup:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-5 h-5"><rect x="1" y="1" width="6" height="6" rx="0.5"/><rect x="9" y="1" width="6" height="6" rx="0.5"/><rect x="1" y="9" width="6" height="6" rx="0.5"/><rect x="9" y="9" width="6" height="6" rx="0.5"/></svg>,
    zoomIn:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-4 h-4"><circle cx="7" cy="7" r="5"/><path d="M7 4v6M4 7h6M12 12l3 3"/></svg>,
    zoomOut:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-4 h-4"><circle cx="7" cy="7" r="5"/><path d="M4 7h6M12 12l3 3"/></svg>,
  };

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
      {/* Brand strip */}
      <div className="flex items-center px-4 pt-1.5 pb-0 gap-2 border-b border-gray-100">
        <span className="font-bold text-blue-600 text-sm tracking-tight">CertGen</span>
        {lastSaved && (
          <span className="text-[10px] text-gray-400 ml-1">
            ✓ Saved {timeSince(lastSaved)}
          </span>
        )}
      </div>

      {/* Ribbon */}
      <div className="flex items-stretch h-[68px] overflow-x-hidden">

        {/* ── History ── */}
        <RibbonGroup label="History">
          <RibbonBtn icon={icons.undo} label="Undo" onClick={undo} disabled={!ready} title="Undo (⌘Z)" />
          <RibbonBtn icon={icons.redo} label="Redo" onClick={redo} disabled={!ready} title="Redo (⌘Y)" />
        </RibbonGroup>

        {/* ── Insert ── */}
        <RibbonGroup label="Insert">
          <RibbonBtn icon={icons.text} label="Text" onClick={addText} disabled={!ready} color="blue" />
          <RibbonBtn icon={icons.image} label="Image" onClick={() => imageRef.current?.click()} disabled={!ready} />
          <RibbonDropBtn
            icon={icons.shapes} label="Shapes"
            onClick={(e) => openPopover(shapesPos, setShapesPos, e)}
            disabled={!ready} open={!!shapesPos}
          />
          <RibbonDropBtn
            icon={icons.qr} label="QR Code"
            onClick={(e) => openPopover(qrPos, setQrPos, e)}
            disabled={!ready} open={!!qrPos}
          />
        </RibbonGroup>

        {/* ── Layout ── */}
        <RibbonGroup label="Layout">
          <RibbonBtn icon={icons.frame} label="Frame" onClick={() => frameRef.current?.click()} disabled={!ready} color="amber" />
          <RibbonBtn icon={icons.watermark} label="Watermark" onClick={() => watermarkRef.current?.click()} disabled={!ready} color="purple" />
        </RibbonGroup>

        {/* ── Variables ── */}
        <RibbonGroup label="Variables">
          <RibbonDropBtn
            icon={icons.variable} label="Insert"
            onClick={(e) => openPopover(varsPos, setVarsPos, e)}
            disabled={!ready} open={!!varsPos}
          />
          <RibbonBtn
            icon={icons.preview} label="Preview"
            onClick={onPreviewToggle} disabled={!ready}
            active={previewMode} color="amber"
            title={xlsxRows ? `Preview with real data (${xlsxRows.length} rows, row ${xlsxRowIdx + 1})` : "Preview variables with sample data"}
          />
          <div className="relative">
            <RibbonBtn
              icon={icons.xlsx} label="Data"
              onClick={() => xlsxRef.current?.click()}
              disabled={!ready}
              color={xlsxRows ? "green" : "default"}
              title={xlsxRows ? `${xlsxRows.length} rows loaded — click to replace` : "Upload Excel data for preview"}
            />
            {xlsxRows && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 bg-green-500 text-white rounded-full text-[8px] flex items-center justify-center font-bold px-0.5 pointer-events-none">
                {xlsxRows.length > 99 ? "99+" : xlsxRows.length}
              </span>
            )}
          </div>
        </RibbonGroup>

        {/* ── Page ── */}
        <RibbonGroup label="Page">
          <RibbonDropBtn
            icon={icons.size} label={canvasSize.label.split(" ")[0]}
            onClick={(e) => openPopover(sizesPos, setSizesPos, e)}
            disabled={!ready} open={!!sizesPos}
          />
          {/* BG color swatch button */}
          <button
            onClick={(e) => openPopover(bgPos, setBgPos, e)}
            disabled={!ready}
            title="Canvas background color"
            className={`flex flex-col items-center justify-center gap-1 w-12 rounded-md py-1.5 text-[10px] font-medium leading-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed
              ${bgPos ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : "text-gray-700 hover:bg-gray-100"}`}
          >
            <span className="flex flex-col items-center gap-0.5">
              <span className="w-5 h-5 flex items-center justify-center">{icons.bg}</span>
              <span
                className="w-5 h-1.5 rounded-sm border border-gray-300"
                style={{ backgroundColor: bgColor }}
              />
            </span>
            <span>BG</span>
          </button>
        </RibbonGroup>

        {/* ── View (Zoom) ── */}
        <RibbonGroup label="View">
          <div className="flex flex-col items-center gap-1 px-1">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => onZoomChange(zoom - 0.1)}
                disabled={!ready}
                title="Zoom out (⌘−)"
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40 transition-colors"
              >
                {icons.zoomOut}
              </button>
              <button
                onClick={() => onZoomChange(1)}
                disabled={!ready}
                title="Reset zoom (⌘0)"
                className="w-10 h-6 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition-colors disabled:opacity-40 tabular-nums"
              >
                {zoomPct}%
              </button>
              <button
                onClick={() => onZoomChange(zoom + 0.1)}
                disabled={!ready}
                title="Zoom in (⌘+)"
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40 transition-colors"
              >
                {icons.zoomIn}
              </button>
            </div>
            {/* Zoom presets */}
            <div className="flex gap-0.5">
              {[50, 75, 100].map((p) => (
                <button
                  key={p}
                  onClick={() => onZoomChange(p / 100)}
                  disabled={!ready}
                  className={`px-1 py-0.5 text-[9px] rounded transition-colors disabled:opacity-40 tabular-nums
                    ${zoomPct === p ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"}`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
        </RibbonGroup>

        {/* ── Arrange (conditional) ── */}
        {(canGroup || canUngroup) && (
          <RibbonGroup label="Arrange">
            {canGroup && (
              <RibbonBtn icon={icons.group} label="Group" onClick={onGroupSelected} color="indigo" title="Group selected (⌘G)" />
            )}
            {canUngroup && (
              <RibbonBtn icon={icons.ungroup} label="Ungroup" onClick={onUngroupSelected} color="indigo" title="Ungroup (⌘G)" />
            )}
          </RibbonGroup>
        )}

        {/* ── File ── */}
        <RibbonGroup label="File">
          <RibbonBtn icon={icons.save} label="Save" onClick={onSaveTemplate} disabled={!ready} />
          <RibbonBtn icon={icons.load} label="Load" onClick={() => templateRef.current?.click()} disabled={!ready} />
          <RibbonBtn icon={icons.library} label="Library" onClick={onOpenTemplates} disabled={!ready} color="indigo" />
          <RibbonBtn icon={icons.clear} label="Clear" onClick={handleClear} disabled={!ready} color="red" />
        </RibbonGroup>

        {/* ── Export ── */}
        <RibbonGroup label="Export">
          <RibbonBtn icon={icons.export} label="Export" onClick={onOpenExport} disabled={!ready} color="green" title="Export pages (PDF / PNG / JPG)" />
          <RibbonBtn icon={icons.bulk} label="Bulk" onClick={onOpenBulk} disabled={!ready} color="blue" title="Bulk certificate generation" />
        </RibbonGroup>

      </div>

      {/* ── Hidden file inputs ── */}
      <input ref={imageRef}    type="file" accept="image/*"                      onChange={handleImage}       className="hidden" />
      <input ref={frameRef}    type="file" accept="image/*"                      onChange={handleFrame}       className="hidden" />
      <input ref={watermarkRef} type="file" accept="image/*"                     onChange={handleWatermark}   className="hidden" />
      <input ref={templateRef} type="file" accept=".json,application/json"       onChange={handleLoadTemplate} className="hidden" />
      <input ref={xlsxRef}    type="file" accept=".xlsx,.xls"                   onChange={handleXlsxUpload} className="hidden" />

      {/* ── Popovers ── */}

      {/* Shapes */}
      {shapesPos && createPortal(
        <div onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: shapesPos.top, left: shapesPos.left, zIndex: 9999 }}
          className="bg-white rounded-xl shadow-2xl border border-gray-100 py-1 w-40"
        >
          {([
            { type: "rect" as const, label: "Rectangle" },
            { type: "circle" as const, label: "Circle" },
            { type: "line" as const, label: "Line" },
          ]).map(({ type, label }) => (
            <button key={type} onClick={() => addShape(type)}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >{label}</button>
          ))}
        </div>, document.body
      )}

      {/* QR Code */}
      {qrPos && createPortal(
        <div onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: qrPos.top, left: qrPos.left, zIndex: 9999 }}
          className="bg-white rounded-xl shadow-2xl border border-gray-100 p-4 w-72"
        >
          <p className="text-xs font-medium text-gray-700 mb-1">QR Code URL</p>
          <p className="text-xs text-gray-400 mb-2 leading-tight">
            Use <span className="font-mono">{"{{name}}"}</span> etc. — bulk export generates per-row QR codes.
          </p>
          <input type="text" value={qrUrl} onChange={(e) => setQrUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addQRCode(); }}
            placeholder="https://example.com/cert/{{name}}"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button onClick={addQRCode} disabled={qrLoading || !qrUrl.trim()}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
          >
            {qrLoading ? "Generating…" : "Add QR Code"}
          </button>
        </div>, document.body
      )}

      {/* Variables */}
      {varsPos && createPortal(
        <div onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: varsPos.top, left: varsPos.left, zIndex: 9999 }}
          className="bg-white rounded-xl shadow-2xl border border-gray-100 p-3 w-56"
        >
          <p className="text-xs text-gray-400 mb-2">Click to insert into selected text or create new</p>
          <div className="grid grid-cols-2 gap-1">
            {VARIABLES.map((v) => (
              <button key={v} onClick={() => insertVariable(v)}
                className="text-left px-2 py-1.5 text-xs font-mono bg-yellow-50 hover:bg-yellow-100 text-yellow-800 rounded-md transition-colors truncate"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>, document.body
      )}

      {/* Canvas size */}
      {sizesPos && createPortal(
        <div onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: sizesPos.top, left: sizesPos.left, zIndex: 9999 }}
          className="bg-white rounded-xl shadow-2xl border border-gray-100 py-1 w-48"
        >
          {CANVAS_SIZES.map((s) => (
            <button key={s.label} onClick={() => { onCanvasSizeChange(s); setSizesPos(null); }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                s.label === canvasSize.label ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {s.label}
              <span className="block text-xs text-gray-400">{s.width} × {s.height}</span>
            </button>
          ))}
        </div>, document.body
      )}

      {/* Background color */}
      {bgPos && createPortal(
        <div onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: bgPos.top, left: bgPos.left, zIndex: 9999 }}
          className="bg-white rounded-xl shadow-2xl border border-gray-100 p-3 space-y-2"
        >
          <p className="text-xs font-medium text-gray-600">Canvas Background</p>
          <HexColorPicker color={bgColor} onChange={onBgColorChange} />
          <input type="text" value={bgColor} onChange={(e) => onBgColorChange(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="flex gap-1">
            {["#ffffff", "#000000", "#f8f4ee", "#1e3a5f", "#e8f4e8"].map((col) => (
              <button key={col} onClick={() => onBgColorChange(col)} title={col}
                style={{ backgroundColor: col }}
                className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
              />
            ))}
          </div>
        </div>, document.body
      )}

    </header>
  );
}
