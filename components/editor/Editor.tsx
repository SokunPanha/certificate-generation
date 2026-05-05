"use client";

// Static import is safe — this module only loads in the browser via EditorWrapper (ssr: false)
import * as fabric from "fabric";
import { useRef, useState, useEffect, useCallback } from "react";
import type { Canvas, Object as FabricObject } from "fabric";
import Toolbar from "./Toolbar";
import LayersPanel from "./LayersPanel";
import PropertiesPanel from "./PropertiesPanel";
import BulkExportModal from "./BulkExportModal";

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

  // Undo / Redo history
  const historyRef = useRef<string[]>([]);
  const histCursorRef = useRef(-1);
  const isRestoringRef = useRef(false);

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
    </div>
  );
}
