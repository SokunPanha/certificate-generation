"use client";

// Static import is safe — this module only loads in the browser via EditorWrapper (ssr: false)
import * as fabric from "fabric";
import { useRef, useState, useEffect, useCallback } from "react";
import type { Canvas, Object as FabricObject, Textbox } from "fabric";
import Toolbar from "./Toolbar";
import LayersPanel from "./LayersPanel";
import PropertiesPanel from "./PropertiesPanel";
import BulkExportModal from "./BulkExportModal";
import TemplatesModal from "./TemplatesModal";
import { autoSave, loadAutoSaved, type AutoSaveRecord } from "@/lib/autoSave";
import { exportToImage } from "@/lib/exportImage";

export type FabricCanvas = Canvas;

export interface CanvasSize {
  label: string;
  width: number;
  height: number;
}

export const CANVAS_SIZES: CanvasSize[] = [
  { label: "A4 Landscape", width: 900, height: 637 },
  { label: "A4 Portrait", width: 637, height: 900 },
  { label: "A5 Landscape", width: 637, height: 451 },
  { label: "Letter Landscape", width: 963, height: 741 },
  { label: "Square", width: 700, height: 700 },
];

const PREVIEW_DATA: Record<string, string> = {
  name: "កុសល ពិសិទ្ធ",
  grade: "A",
  class: "7A",
  rank: "១",
  school: "វិទ្យាល័យ ហ៊ុន សែន",
  date: "២៣ មិនា ២០២៦",
  result: "ជាប់",
  year: "2025-2026",
  semester: "១",
  gender: "ប្រុស",
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

export default function Editor() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const [ready, setReady] = useState(false);
  const [activeObject, setActiveObject] = useState<FabricObject | null>(null);
  const [layers, setLayers] = useState<FabricObject[]>([]);
  const [canvasSize, setCanvasSizeState] = useState<CanvasSize>(CANVAS_SIZES[0]);
  const [bgColor, setBgColorState] = useState("#ffffff");
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [previewMode, setPreviewMode] = useState(false);
  const previewModeRef = useRef(false);
  const previewOriginalsRef = useRef<Map<FabricObject, string>>(new Map());
  const [previewToast, setPreviewToast] = useState<string | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [autoSaveRestore, setAutoSaveRestore] = useState<AutoSaveRecord | null>(null);

  // Undo / Redo history
  const historyRef = useRef<string[]>([]);
  const histCursorRef = useRef(-1);
  const isRestoringRef = useRef(false);
  const clipboardRef = useRef<FabricObject | null>(null);

  const syncLayers = useCallback(() => {
    const c = fabricRef.current;
    if (c) setLayers([...c.getObjects()]);
  }, []);

  const saveSnapshot = useCallback(() => {
    if (isRestoringRef.current) return;
    const c = fabricRef.current;
    if (!c) return;
    const snap = JSON.stringify(c.toObject(["data"]));
    historyRef.current = historyRef.current.slice(0, histCursorRef.current + 1);
    historyRef.current.push(snap);
    if (historyRef.current.length > 50) historyRef.current.shift();
    histCursorRef.current = historyRef.current.length - 1;
  }, []);

  const exitPreview = useCallback(() => {
    const c = fabricRef.current;
    if (!previewModeRef.current || !c) return;
    isRestoringRef.current = true;
    previewOriginalsRef.current.forEach((originalText, obj) => {
      (obj as Textbox).set({ text: originalText });
    });
    isRestoringRef.current = false;
    previewOriginalsRef.current.clear();
    previewModeRef.current = false;
    setPreviewMode(false);
    c.renderAll();
  }, []);

  const undo = useCallback(async () => {
    exitPreview();
    const c = fabricRef.current;
    if (!c || histCursorRef.current <= 0) return;
    histCursorRef.current--;
    isRestoringRef.current = true;
    await c.loadFromJSON(JSON.parse(historyRef.current[histCursorRef.current]));
    c.renderAll();
    isRestoringRef.current = false;
    setActiveObject(null);
    syncLayers();
  }, [syncLayers, exitPreview]);

  const redo = useCallback(async () => {
    exitPreview();
    const c = fabricRef.current;
    if (!c || histCursorRef.current >= historyRef.current.length - 1) return;
    histCursorRef.current++;
    isRestoringRef.current = true;
    await c.loadFromJSON(JSON.parse(historyRef.current[histCursorRef.current]));
    c.renderAll();
    isRestoringRef.current = false;
    setActiveObject(null);
    syncLayers();
  }, [syncLayers, exitPreview]);

  const changeCanvasSize = useCallback((size: CanvasSize) => {
    const c = fabricRef.current;
    if (!c) return;
    c.setDimensions({ width: size.width, height: size.height });
    c.renderAll();
    setCanvasSizeState(size);
    setZoom(1);
    zoomRef.current = 1;
    saveSnapshot();
  }, [saveSnapshot]);

  const changeBgColor = useCallback((color: string) => {
    const c = fabricRef.current;
    if (!c) return;
    c.backgroundColor = color;
    c.renderAll();
    setBgColorState(color);
    saveSnapshot();
  }, [saveSnapshot]);

  const changeZoom = useCallback((newZoom: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
    setZoom(clamped);
    zoomRef.current = clamped;
  }, []);

  const togglePreviewMode = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;

    if (!previewModeRef.current) {
      const originals = new Map<FabricObject, string>();
      isRestoringRef.current = true;
      c.getObjects().forEach((obj) => {
        if (obj.type === "textbox" || obj.type === "i-text" || obj.type === "text") {
          const tb = obj as Textbox;
          const original = tb.text ?? "";
          const filled = original.replace(/\{\{(\w+)\}\}/g, (_, v) => PREVIEW_DATA[v] ?? `{{${v}}}`);
          if (filled !== original) {
            originals.set(obj, original);
            tb.set({ text: filled });
          }
        }
      });
      isRestoringRef.current = false;
      previewOriginalsRef.current = originals;
      c.renderAll();

      if (originals.size === 0) {
        setPreviewToast("No {{variables}} found on canvas — add text with {{name}}, {{grade}}, etc.");
        setTimeout(() => setPreviewToast(null), 4000);
        return;
      }
      previewModeRef.current = true;
      setPreviewMode(true);
    } else {
      isRestoringRef.current = true;
      previewOriginalsRef.current.forEach((originalText, obj) => {
        (obj as Textbox).set({ text: originalText });
      });
      isRestoringRef.current = false;
      previewOriginalsRef.current.clear();
      c.renderAll();
      previewModeRef.current = false;
      setPreviewMode(false);
    }
  }, []);

  const groupSelected = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active || active.type !== "activeSelection") return;
    // Capture objects before discarding the active selection
    const objects = (active as fabric.ActiveSelection).getObjects().slice();
    c.discardActiveObject();
    objects.forEach((obj) => c.remove(obj));
    const group = new fabric.Group(objects);
    c.add(group);
    c.setActiveObject(group);
    c.renderAll();
    syncLayers();
    saveSnapshot();
  }, [syncLayers, saveSnapshot]);

  const ungroupSelected = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active || active.type !== "group") return;
    const group = active as fabric.Group;
    const matrix = group.calcTransformMatrix();
    const objects = group.getObjects().slice();
    c.remove(group);
    for (const obj of objects) {
      const objMatrix = obj.calcTransformMatrix();
      const newMatrix = fabric.util.multiplyTransformMatrices(matrix, objMatrix);
      const decomposed = fabric.util.qrDecompose(newMatrix);
      obj.set({
        scaleX: decomposed.scaleX,
        scaleY: decomposed.scaleY,
        skewX: decomposed.skewX,
        skewY: decomposed.skewY,
        angle: decomposed.angle,
      });
      obj.setPositionByOrigin(
        new fabric.Point(decomposed.translateX, decomposed.translateY),
        "center",
        "center"
      );
      obj.setCoords();
      c.add(obj);
    }
    const sel = new fabric.ActiveSelection(objects, { canvas: c });
    c.setActiveObject(sel);
    c.renderAll();
    syncLayers();
    saveSnapshot();
  }, [syncLayers, saveSnapshot]);

  const saveTemplate = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const json = JSON.stringify({ ...c.toObject(["data"]), _certgen: { canvasSize, bgColor } }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: "certificate-template.json",
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [canvasSize, bgColor]);

  const loadTemplate = useCallback(async (file: File) => {
    const c = fabricRef.current;
    if (!c) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (json._certgen?.canvasSize) {
        const s: CanvasSize = json._certgen.canvasSize;
        c.setDimensions({ width: s.width, height: s.height });
        setCanvasSizeState(s);
      }
      if (json._certgen?.bgColor) {
        c.backgroundColor = json._certgen.bgColor;
        setBgColorState(json._certgen.bgColor);
      }
      const { _certgen: _, ...canvasJSON } = json;
      await c.loadFromJSON(canvasJSON);
      c.renderAll();
      setActiveObject(null);
      setZoom(1);
      zoomRef.current = 1;
      syncLayers();
      saveSnapshot();
    } catch {
      alert("Could not load template — invalid JSON file.");
    }
  }, [syncLayers, saveSnapshot]);

  const loadTemplateData = useCallback(async (json: Record<string, unknown>) => {
    const c = fabricRef.current;
    if (!c) return;
    if (json._certgen && typeof json._certgen === "object") {
      const meta = json._certgen as { canvasSize?: CanvasSize; bgColor?: string };
      if (meta.canvasSize) {
        const s = meta.canvasSize;
        c.setDimensions({ width: s.width, height: s.height });
        setCanvasSizeState(s);
      }
      if (meta.bgColor) {
        c.backgroundColor = meta.bgColor;
        setBgColorState(meta.bgColor);
      }
    }
    const { _certgen: _, ...canvasJSON } = json;
    await c.loadFromJSON(canvasJSON);
    c.renderAll();
    setActiveObject(null);
    setZoom(1);
    zoomRef.current = 1;
    syncLayers();
    saveSnapshot();
  }, [syncLayers, saveSnapshot]);

  const handleExportImage = useCallback(async (format: "png" | "jpeg") => {
    const c = fabricRef.current;
    if (c) await exportToImage(c, format);
  }, []);

  const restoreAutoSave = useCallback(async (record: AutoSaveRecord) => {
    const c = fabricRef.current;
    if (!c) return;
    setAutoSaveRestore(null);
    const s = record.canvasSize;
    c.setDimensions({ width: s.width, height: s.height });
    setCanvasSizeState(s);
    c.backgroundColor = record.bgColor;
    setBgColorState(record.bgColor);
    await c.loadFromJSON(JSON.parse(record.canvasJSON));
    c.renderAll();
    setActiveObject(null);
    setZoom(1);
    zoomRef.current = 1;
    syncLayers();
    saveSnapshot();
  }, [syncLayers, saveSnapshot]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(async () => {
      const c = fabricRef.current;
      if (!c || isRestoringRef.current || previewModeRef.current) return;
      try {
        await autoSave(
          JSON.stringify(c.toObject(["data"])),
          canvasSize,
          bgColor
        );
        setLastSaved(new Date());
      } catch {
        // silently ignore autosave failures
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [ready, canvasSize, bgColor]);

  useEffect(() => {
    if (!canvasElRef.current) return;

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: CANVAS_SIZES[0].width,
      height: CANVAS_SIZES[0].height,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
    });

    fabricRef.current = canvas;
    setReady(true);

    historyRef.current = [JSON.stringify(canvas.toObject(["data"]))];
    histCursorRef.current = 0;

    // Check for auto-save on mount
    loadAutoSaved().then((record) => {
      if (record) setAutoSaveRestore(record);
    }).catch(() => {});

    canvas.on("selection:created", (e) => {
      const sel = (e as { selected?: FabricObject[] }).selected;
      setActiveObject(sel?.[0] ?? null);
    });
    canvas.on("selection:updated", (e) => {
      const sel = (e as { selected?: FabricObject[] }).selected;
      setActiveObject(sel?.[0] ?? null);
    });
    canvas.on("selection:cleared", () => setActiveObject(null));

    canvas.on("object:added", () => { syncLayers(); saveSnapshot(); });
    canvas.on("object:removed", () => { syncLayers(); saveSnapshot(); });
    canvas.on("object:modified", saveSnapshot);
    canvas.on("text:changed", saveSnapshot);

    // --- Alignment guides ---
    const guides = { h: [] as number[], v: [] as number[] };
    const SNAP = 8;

    const getAlignPoints = (o: FabricObject) => {
      const br = o.getBoundingRect();
      return {
        x: [br.left, br.left + br.width / 2, br.left + br.width],
        y: [br.top, br.top + br.height / 2, br.top + br.height],
      };
    };

    canvas.on("object:moving", (e) => {
      const obj = (e as unknown as { target: FabricObject }).target;
      if (!obj) return;
      const cw = canvas.getWidth();
      const ch = canvas.getHeight();
      guides.h = [];
      guides.v = [];

      const { x: objX, y: objY } = getAlignPoints(obj);
      const snapXs = [0, cw / 2, cw];
      const snapYs = [0, ch / 2, ch];
      for (const other of canvas.getObjects()) {
        if (other === obj) continue;
        const p = getAlignPoints(other);
        snapXs.push(...p.x);
        snapYs.push(...p.y);
      }

      let bestDx = Infinity, snapDx = 0, guideX: number | null = null;
      let bestDy = Infinity, snapDy = 0, guideY: number | null = null;

      for (const ox of objX) {
        for (const sx of snapXs) {
          const d = Math.abs(ox - sx);
          if (d < SNAP && d < bestDx) { bestDx = d; snapDx = ox - sx; guideX = sx; }
        }
      }
      for (const oy of objY) {
        for (const sy of snapYs) {
          const d = Math.abs(oy - sy);
          if (d < SNAP && d < bestDy) { bestDy = d; snapDy = oy - sy; guideY = sy; }
        }
      }

      if (guideX !== null) { obj.set({ left: (obj.left ?? 0) - snapDx }); guides.v.push(guideX); }
      if (guideY !== null) { obj.set({ top: (obj.top ?? 0) - snapDy }); guides.h.push(guideY); }
      if (guideX !== null || guideY !== null) obj.setCoords();
    });

    canvas.on("after:render", () => {
      if (!guides.h.length && !guides.v.length) return;
      const ctx = (canvas as unknown as { contextContainer: CanvasRenderingContext2D }).contextContainer;
      const cw = canvas.getWidth();
      const ch = canvas.getHeight();
      ctx.save();
      ctx.strokeStyle = "#e83e8c";
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      for (const y of guides.h) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
      }
      for (const x of guides.v) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
      }
      ctx.restore();
    });

    const clearGuides = () => {
      if (!guides.h.length && !guides.v.length) return;
      guides.h = [];
      guides.v = [];
      canvas.requestRenderAll();
    };

    canvas.on("object:modified", clearGuides);
    canvas.on("mouse:up", clearGuides);

    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault(); undo(); return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault(); redo(); return;
      }

      // Group: Ctrl+G (toggle group/ungroup)
      if ((e.metaKey || e.ctrlKey) && e.key === "g" && !e.shiftKey && !isEditing) {
        e.preventDefault();
        const active = canvas.getActiveObject();
        if (active?.type === "activeSelection") {
          const objects = (active as fabric.ActiveSelection).getObjects().slice();
          canvas.discardActiveObject();
          objects.forEach((obj) => canvas.remove(obj));
          const group = new fabric.Group(objects);
          canvas.add(group);
          canvas.setActiveObject(group);
          canvas.renderAll();
          syncLayers();
          saveSnapshot();
        } else if (active?.type === "group") {
          const group = active as fabric.Group;
          const matrix = group.calcTransformMatrix();
          const objects = group.getObjects().slice();
          canvas.remove(group);
          for (const obj of objects) {
            const newMatrix = fabric.util.multiplyTransformMatrices(matrix, obj.calcTransformMatrix());
            const decomposed = fabric.util.qrDecompose(newMatrix);
            obj.set({ scaleX: decomposed.scaleX, scaleY: decomposed.scaleY, skewX: decomposed.skewX, skewY: decomposed.skewY, angle: decomposed.angle });
            obj.setPositionByOrigin(new fabric.Point(decomposed.translateX, decomposed.translateY), "center", "center");
            obj.setCoords();
            canvas.add(obj);
          }
          const sel = new fabric.ActiveSelection(objects, { canvas });
          canvas.setActiveObject(sel);
          canvas.renderAll();
          syncLayers();
          saveSnapshot();
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        if (isEditing) return;
        const obj = canvas.getActiveObject();
        if (!obj || (obj as { isEditing?: boolean }).isEditing) return;
        obj.clone(["data"]).then((cloned: FabricObject) => { clipboardRef.current = cloned; });
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        if (isEditing || !clipboardRef.current) return;
        const active = canvas.getActiveObject();
        if ((active as { isEditing?: boolean })?.isEditing) return;
        e.preventDefault();
        clipboardRef.current.clone(["data"]).then((pasted: FabricObject) => {
          const newLeft = (clipboardRef.current!.left ?? 0) + 20;
          const newTop = (clipboardRef.current!.top ?? 0) + 20;
          pasted.set({ left: newLeft, top: newTop, evented: true });
          clipboardRef.current!.set({ left: newLeft, top: newTop });
          canvas.add(pasted);
          canvas.setActiveObject(pasted);
          canvas.renderAll();
        });
        return;
      }

      // Zoom keyboard shortcuts
      if ((e.metaKey || e.ctrlKey) && e.key === "=" && !isEditing) {
        e.preventDefault();
        const next = Math.min(MAX_ZOOM, zoomRef.current + 0.1);
        setZoom(next); zoomRef.current = next; return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "-" && !isEditing) {
        e.preventDefault();
        const next = Math.max(MIN_ZOOM, zoomRef.current - 0.1);
        setZoom(next); zoomRef.current = next; return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "0" && !isEditing) {
        e.preventDefault();
        setZoom(1); zoomRef.current = 1; return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && !isEditing) {
        const obj = canvas.getActiveObject();
        if (obj) {
          canvas.remove(obj);
          canvas.discardActiveObject();
          canvas.renderAll();
          setActiveObject(null);
        }
      }

      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && !isEditing) {
        const obj = canvas.getActiveObject();
        if (!obj || (obj as { isEditing?: boolean }).isEditing) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        obj.set({ left: (obj.left ?? 0) + dx, top: (obj.top ?? 0) + dy });
        obj.setCoords();
        canvas.renderAll();
        clearTimeout((handleKey as unknown as { _t?: ReturnType<typeof setTimeout> })._t);
        (handleKey as unknown as { _t?: ReturnType<typeof setTimeout> })._t =
          setTimeout(() => saveSnapshot(), 400);
      }
    };

    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("keydown", handleKey);
      canvas.dispose();
      fabricRef.current = null;
      setReady(false);
    };
  }, [syncLayers, saveSnapshot, undo, redo]);

  // Ctrl+scroll zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current + delta));
    setZoom(next);
    zoomRef.current = next;
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Toolbar
        fabricRef={fabricRef}
        ready={ready}
        syncLayers={syncLayers}
        saveSnapshot={saveSnapshot}
        undo={undo}
        redo={redo}
        canvasSize={canvasSize}
        onCanvasSizeChange={changeCanvasSize}
        bgColor={bgColor}
        onBgColorChange={changeBgColor}
        zoom={zoom}
        onZoomChange={changeZoom}
        previewMode={previewMode}
        onPreviewToggle={togglePreviewMode}
        activeObject={activeObject}
        onGroupSelected={groupSelected}
        onUngroupSelected={ungroupSelected}
        onExportImage={handleExportImage}
        onSaveTemplate={saveTemplate}
        onLoadTemplate={loadTemplate}
        onOpenBulk={() => setShowBulk(true)}
        onOpenTemplates={() => setShowTemplates(true)}
        lastSaved={lastSaved}
      />

      {/* Auto-save restore banner */}
      {autoSaveRestore && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-200 text-sm text-blue-800 flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="7" cy="7" r="6" />
            <path d="M7 4v3l2 1.5" />
          </svg>
          <span>
            Auto-save found from{" "}
            <strong>{new Date(autoSaveRestore.savedAt).toLocaleTimeString()}</strong>
            {" "}— restore it?
          </span>
          <button
            onClick={() => restoreAutoSave(autoSaveRestore)}
            className="px-3 py-1 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors"
          >
            Restore
          </button>
          <button
            onClick={() => setAutoSaveRestore(null)}
            className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-xs hover:bg-blue-200 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Preview mode banner */}
      {previewMode && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6" cy="6" r="5" />
            <circle cx="6" cy="6" r="2" fill="currentColor" stroke="none" />
          </svg>
          Preview mode — variables replaced with sample data. Edits and auto-save are paused.
          <button
            onClick={togglePreviewMode}
            className="ml-2 underline hover:no-underline"
          >
            Exit
          </button>
        </div>
      )}

      {/* Toast for no-variables feedback */}
      {previewToast && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-orange-50 border-b border-orange-200 text-xs text-orange-700 flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6" cy="6" r="5" />
            <path d="M6 4v3M6 8.5v.5" strokeLinecap="round" />
          </svg>
          {previewToast}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden min-w-0">
        <LayersPanel
          layers={layers}
          fabricRef={fabricRef}
          activeObject={activeObject}
          setActiveObject={setActiveObject}
          syncLayers={syncLayers}
          saveSnapshot={saveSnapshot}
        />

        <div
          className="flex-1 min-w-0 overflow-hidden bg-gray-300 flex items-center justify-center"
          onWheel={handleWheel}
        >
          {/* CSS-transform zoom — does NOT change canvas data dimensions, so export is unaffected */}
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
            className="shadow-2xl ring-1 ring-black/10 flex-shrink-0"
          >
            <canvas ref={canvasElRef} />
          </div>
        </div>

        <PropertiesPanel
          activeObject={activeObject}
          fabricRef={fabricRef}
          bgColor={bgColor}
          onBgColorChange={changeBgColor}
        />
      </div>

      {showBulk && (
        <BulkExportModal fabricRef={fabricRef} onClose={() => setShowBulk(false)} />
      )}

      {showTemplates && (
        <TemplatesModal
          fabricRef={fabricRef}
          canvasSize={canvasSize}
          onLoad={loadTemplateData}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  );
}
