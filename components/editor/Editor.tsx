"use client";

// Static import is safe — this module only loads in the browser via EditorWrapper (ssr: false)
import * as fabric from "fabric";
import { useRef, useState, useEffect, useCallback } from "react";
import type { Canvas, Object as FabricObject } from "fabric";
import Toolbar from "./Toolbar";
import LayersPanel from "./LayersPanel";
import PropertiesPanel from "./PropertiesPanel";
import BulkExportModal from "./BulkExportModal";
import TemplatesModal from "./TemplatesModal";

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

export default function Editor() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const [ready, setReady] = useState(false);
  const [activeObject, setActiveObject] = useState<FabricObject | null>(null);
  const [layers, setLayers] = useState<FabricObject[]>([]);
  const [canvasSize, setCanvasSizeState] = useState<CanvasSize>(CANVAS_SIZES[0]);
  const [showBulk, setShowBulk] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

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
    // Drop any forward history
    historyRef.current = historyRef.current.slice(0, histCursorRef.current + 1);
    historyRef.current.push(snap);
    // Cap at 50 states to avoid memory bloat
    if (historyRef.current.length > 50) historyRef.current.shift();
    histCursorRef.current = historyRef.current.length - 1;
  }, []);

  const undo = useCallback(async () => {
    const c = fabricRef.current;
    if (!c || histCursorRef.current <= 0) return;
    histCursorRef.current--;
    isRestoringRef.current = true;
    await c.loadFromJSON(JSON.parse(historyRef.current[histCursorRef.current]));
    c.renderAll();
    isRestoringRef.current = false;
    setActiveObject(null);
    syncLayers();
  }, [syncLayers]);

  const redo = useCallback(async () => {
    const c = fabricRef.current;
    if (!c || histCursorRef.current >= historyRef.current.length - 1) return;
    histCursorRef.current++;
    isRestoringRef.current = true;
    await c.loadFromJSON(JSON.parse(historyRef.current[histCursorRef.current]));
    c.renderAll();
    isRestoringRef.current = false;
    setActiveObject(null);
    syncLayers();
  }, [syncLayers]);

  const changeCanvasSize = useCallback((size: CanvasSize) => {
    const c = fabricRef.current;
    if (!c) return;
    c.setDimensions({ width: size.width, height: size.height });
    c.renderAll();
    setCanvasSizeState(size);
    saveSnapshot();
  }, [saveSnapshot]);

  const saveTemplate = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const json = JSON.stringify({ ...c.toObject(["data"]), _certgen: { canvasSize } }, null, 2);
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
  }, [canvasSize]);

  const loadTemplate = useCallback(async (file: File) => {
    const c = fabricRef.current;
    if (!c) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      // Restore canvas size if saved
      if (json._certgen?.canvasSize) {
        const s: CanvasSize = json._certgen.canvasSize;
        c.setDimensions({ width: s.width, height: s.height });
        setCanvasSizeState(s);
      }
      const { _certgen: _, ...canvasJSON } = json;
      await c.loadFromJSON(canvasJSON);
      c.renderAll();
      setActiveObject(null);
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
      const meta = json._certgen as { canvasSize?: CanvasSize };
      if (meta.canvasSize) {
        const s = meta.canvasSize;
        c.setDimensions({ width: s.width, height: s.height });
        setCanvasSizeState(s);
      }
    }
    const { _certgen: _, ...canvasJSON } = json;
    await c.loadFromJSON(canvasJSON);
    c.renderAll();
    setActiveObject(null);
    syncLayers();
    saveSnapshot();
  }, [syncLayers, saveSnapshot]);

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

    // Save initial blank state
    historyRef.current = [JSON.stringify(canvas.toObject(["data"]))];
    histCursorRef.current = 0;

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
        e.preventDefault();
        undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        if (isEditing) return;
        const c = fabricRef.current;
        if (!c) return;
        const obj = c.getActiveObject();
        if (!obj || (obj as { isEditing?: boolean }).isEditing) return;
        obj.clone(["data"]).then((cloned: FabricObject) => {
          clipboardRef.current = cloned;
        });
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        if (isEditing || !clipboardRef.current) return;
        const c = fabricRef.current;
        if (!c) return;
        const active = c.getActiveObject();
        if ((active as { isEditing?: boolean })?.isEditing) return;
        e.preventDefault();
        clipboardRef.current.clone(["data"]).then((pasted: FabricObject) => {
          const newLeft = (clipboardRef.current!.left ?? 0) + 20;
          const newTop = (clipboardRef.current!.top ?? 0) + 20;
          pasted.set({ left: newLeft, top: newTop, evented: true });
          clipboardRef.current!.set({ left: newLeft, top: newTop });
          c.add(pasted);
          c.setActiveObject(pasted);
          c.renderAll();
        });
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && !isEditing) {
        const c = fabricRef.current;
        if (!c) return;
        const obj = c.getActiveObject();
        if (obj) {
          c.remove(obj);
          c.discardActiveObject();
          c.renderAll();
          setActiveObject(null);
        }
      }

      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && !isEditing) {
        const c = fabricRef.current;
        if (!c) return;
        const obj = c.getActiveObject();
        if (!obj || (obj as { isEditing?: boolean }).isEditing) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        obj.set({ left: (obj.left ?? 0) + dx, top: (obj.top ?? 0) + dy });
        obj.setCoords();
        c.renderAll();
        // Debounce snapshot so rapid key-repeat doesn't flood history
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
        onSaveTemplate={saveTemplate}
        onLoadTemplate={loadTemplate}
        onOpenBulk={() => setShowBulk(true)}
        onOpenTemplates={() => setShowTemplates(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <LayersPanel
          layers={layers}
          fabricRef={fabricRef}
          activeObject={activeObject}
          setActiveObject={setActiveObject}
          syncLayers={syncLayers}
        />

        <div className="flex-1 flex items-center justify-center overflow-auto bg-gray-300 p-8">
          <div className="shadow-2xl ring-1 ring-black/10">
            <canvas ref={canvasElRef} />
          </div>
        </div>

        <PropertiesPanel activeObject={activeObject} fabricRef={fabricRef} />
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
