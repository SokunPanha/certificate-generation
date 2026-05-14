"use client";

// Static import is safe — this module only loads in the browser via EditorWrapper (ssr: false)
import * as fabric from "fabric";
import { useRef, useState, useEffect, useCallback } from "react";
import type { Canvas, FabricObject, Textbox } from "fabric";
import Toolbar from "./Toolbar";
import LayersPanel from "./LayersPanel";
import PropertiesPanel from "./PropertiesPanel";
import PagesPanel from "./PagesPanel";
import BulkExportModal from "./BulkExportModal";
import TemplatesModal from "./TemplatesModal";
import ExportModal from "./ExportModal";
import { autoSave, loadAutoSaved, type AutoSaveRecord, type SavedPage } from "@/lib/autoSave";

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

export interface Page {
  id: string;
  canvasJSON: string;
  bgColor: string;
  thumbnail: string;
}

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

const EMPTY_CANVAS_JSON = JSON.stringify({ version: "6.0.0", objects: [] });

function makePage(canvasJSON: string, bgColor: string, thumbnail = ""): Page {
  return { id: crypto.randomUUID(), canvasJSON, bgColor, thumbnail };
}

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

  // Multi-page state
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const pagesRef = useRef<Page[]>([]);
  const currentPageIdxRef = useRef(0);

  const [previewMode, setPreviewMode] = useState(false);
  const previewModeRef = useRef(false);
  const previewOriginalsRef = useRef<Map<FabricObject, string>>(new Map());
  const [previewToast, setPreviewToast] = useState<string | null>(null);
  const xlsxRowsRef = useRef<Record<string, string>[] | null>(null);
  const xlsxRowIdxRef = useRef(0);
  const [xlsxRows, setXlsxRows] = useState<Record<string, string>[] | null>(null);
  const [xlsxRowIdx, setXlsxRowIdx] = useState(0);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkTemplateJSON, setBulkTemplateJSON] = useState<object>({});
  const [showTemplates, setShowTemplates] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportPages, setExportPages] = useState<Page[]>([]);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [autoSaveRestore, setAutoSaveRestore] = useState<AutoSaveRecord | null>(null);

  // Undo / Redo history (per-page; resets on page switch)
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

  // ── Page utilities ───────────────────────────────────────────────────────────

  const captureCurrentPage = useCallback((): Page => {
    const c = fabricRef.current!;
    let thumbnail = pagesRef.current[currentPageIdxRef.current]?.thumbnail ?? "";
    try {
      c.discardActiveObject();
      c.renderAll();
      thumbnail = c.toDataURL({ format: "png", multiplier: 0.2 });
    } catch { /* keep existing thumbnail on error */ }
    return {
      id: pagesRef.current[currentPageIdxRef.current]?.id ?? crypto.randomUUID(),
      canvasJSON: JSON.stringify(c.toObject(["data"])),
      bgColor: (c.backgroundColor as string) || "#ffffff",
      thumbnail,
    };
  }, []);

  const loadPageOntoCanvas = useCallback(async (page: Page) => {
    const c = fabricRef.current;
    if (!c) return;
    isRestoringRef.current = true;
    await c.loadFromJSON(JSON.parse(page.canvasJSON));
    c.backgroundColor = page.bgColor;
    c.renderAll();
    isRestoringRef.current = false;
    setBgColorState(page.bgColor);
    setActiveObject(null);
    historyRef.current = [page.canvasJSON];
    histCursorRef.current = 0;
    syncLayers();
  }, [syncLayers]);

  const switchToPage = useCallback(async (idx: number) => {
    if (idx === currentPageIdxRef.current) return;
    const captured = captureCurrentPage();
    const newPages = [...pagesRef.current];
    newPages[currentPageIdxRef.current] = captured;
    await loadPageOntoCanvas(newPages[idx]);
    pagesRef.current = newPages;
    currentPageIdxRef.current = idx;
    setPages([...newPages]);
    setCurrentPageIdx(idx);
  }, [captureCurrentPage, loadPageOntoCanvas]);

  const addPage = useCallback(async () => {
    const captured = captureCurrentPage();
    const newPages = [...pagesRef.current];
    newPages[currentPageIdxRef.current] = captured;
    const newPage = makePage(EMPTY_CANVAS_JSON, "#ffffff");
    newPages.push(newPage);
    const newIdx = newPages.length - 1;
    await loadPageOntoCanvas(newPage);
    pagesRef.current = newPages;
    currentPageIdxRef.current = newIdx;
    setPages([...newPages]);
    setCurrentPageIdx(newIdx);
  }, [captureCurrentPage, loadPageOntoCanvas]);

  const duplicatePage = useCallback(async (idx: number) => {
    const captured = captureCurrentPage();
    const newPages = [...pagesRef.current];
    newPages[currentPageIdxRef.current] = captured;
    const source = newPages[idx];
    const dup = makePage(source.canvasJSON, source.bgColor, source.thumbnail);
    newPages.splice(idx + 1, 0, dup);
    const newIdx = idx + 1;
    await loadPageOntoCanvas(dup);
    pagesRef.current = newPages;
    currentPageIdxRef.current = newIdx;
    setPages([...newPages]);
    setCurrentPageIdx(newIdx);
  }, [captureCurrentPage, loadPageOntoCanvas]);

  const deletePage = useCallback(async (idx: number) => {
    if (pagesRef.current.length <= 1) return;
    const newPages = [...pagesRef.current];
    newPages.splice(idx, 1);
    const newIdx = Math.min(idx, newPages.length - 1);
    await loadPageOntoCanvas(newPages[newIdx]);
    pagesRef.current = newPages;
    currentPageIdxRef.current = newIdx;
    setPages([...newPages]);
    setCurrentPageIdx(newIdx);
  }, [loadPageOntoCanvas]);

  // ── Preview mode ─────────────────────────────────────────────────────────────

  const applyDataToCanvas = useCallback((data: Record<string, string>) => {
    const c = fabricRef.current;
    if (!c) return new Map<FabricObject, string>();
    const originals = new Map<FabricObject, string>();
    isRestoringRef.current = true;
    c.getObjects().forEach((obj) => {
      if (obj.type === "textbox" || obj.type === "i-text" || obj.type === "text") {
        const tb = obj as Textbox;
        const original = tb.text ?? "";
        const filled = original.replace(/\{\{(\w+)\}\}/g, (_, v) => data[v] ?? `{{${v}}}`);
        if (filled !== original) {
          originals.set(obj, original);
          tb.set({ text: filled });
        }
      }
    });
    isRestoringRef.current = false;
    return originals;
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

  // ── Undo / Redo ───────────────────────────────────────────────────────────────

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

  // ── Canvas / view controls ────────────────────────────────────────────────────

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
      const data = xlsxRowsRef.current?.[xlsxRowIdxRef.current] ?? PREVIEW_DATA;
      const originals = applyDataToCanvas(data);
      c.renderAll();

      if (originals.size === 0) {
        setPreviewToast("No {{variables}} found on canvas — add text with {{name}}, {{grade}}, etc.");
        setTimeout(() => setPreviewToast(null), 4000);
        return;
      }
      previewOriginalsRef.current = originals;
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
  }, [applyDataToCanvas]);

  const handleXlsxLoad = useCallback((rows: Record<string, string>[]) => {
    xlsxRowsRef.current = rows;
    xlsxRowIdxRef.current = 0;
    setXlsxRows(rows);
    setXlsxRowIdx(0);
    if (previewModeRef.current) {
      const c = fabricRef.current;
      if (!c) return;
      isRestoringRef.current = true;
      previewOriginalsRef.current.forEach((originalText, obj) => {
        (obj as Textbox).set({ text: originalText });
      });
      isRestoringRef.current = false;
      previewOriginalsRef.current.clear();
      const originals = applyDataToCanvas(rows[0]);
      previewOriginalsRef.current = originals;
      c.renderAll();
    }
  }, [applyDataToCanvas]);

  const changeXlsxRow = useCallback((idx: number) => {
    const rows = xlsxRowsRef.current;
    if (!rows) return;
    const clamped = Math.max(0, Math.min(rows.length - 1, idx));
    xlsxRowIdxRef.current = clamped;
    setXlsxRowIdx(clamped);
    if (!previewModeRef.current) return;
    const c = fabricRef.current;
    if (!c) return;
    isRestoringRef.current = true;
    previewOriginalsRef.current.forEach((originalText, obj) => {
      (obj as Textbox).set({ text: originalText });
    });
    isRestoringRef.current = false;
    previewOriginalsRef.current.clear();
    const originals = applyDataToCanvas(rows[clamped]);
    previewOriginalsRef.current = originals;
    c.renderAll();
  }, [applyDataToCanvas]);

  // ── Group / Ungroup ───────────────────────────────────────────────────────────

  const groupSelected = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const active = c.getActiveObject();
    if (!active || active.type !== "activeSelection") return;
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
      const newMatrix = fabric.util.multiplyTransformMatrices(matrix, obj.calcTransformMatrix());
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

  // ── Template save / load ──────────────────────────────────────────────────────

  const saveTemplate = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    const captured = captureCurrentPage();
    const allPages = [...pagesRef.current];
    allPages[currentPageIdxRef.current] = captured;

    const json = JSON.stringify(
      {
        _certgen: { canvasSize, version: 2 },
        _pages: allPages.map((p) => ({
          id: p.id,
          bgColor: p.bgColor,
          canvasJSON: JSON.parse(p.canvasJSON),
        })),
      },
      null,
      2
    );
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "certificate-template.json" });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [canvasSize, captureCurrentPage]);

  const applyLoadedPages = useCallback(async (loadedPages: Page[], startIdx: number) => {
    const c = fabricRef.current;
    if (!c) return;
    const first = loadedPages[startIdx];
    isRestoringRef.current = true;
    await c.loadFromJSON(JSON.parse(first.canvasJSON));
    c.backgroundColor = first.bgColor;
    c.renderAll();
    isRestoringRef.current = false;
    setBgColorState(first.bgColor);
    setActiveObject(null);
    setZoom(1);
    zoomRef.current = 1;
    historyRef.current = [first.canvasJSON];
    histCursorRef.current = 0;
    pagesRef.current = loadedPages;
    currentPageIdxRef.current = startIdx;
    setPages([...loadedPages]);
    setCurrentPageIdx(startIdx);
    syncLayers();
  }, [syncLayers]);

  // Appends template pages after existing pages instead of replacing them.
  const appendLoadedPages = useCallback(async (newPages: Page[]) => {
    const c = fabricRef.current;
    if (!c) return;
    const captured = captureCurrentPage();
    const existing = [...pagesRef.current];
    existing[currentPageIdxRef.current] = captured;
    const merged = [...existing, ...newPages];
    const newIdx = existing.length;
    const first = newPages[0];
    isRestoringRef.current = true;
    await c.loadFromJSON(JSON.parse(first.canvasJSON));
    c.backgroundColor = first.bgColor;
    c.renderAll();
    isRestoringRef.current = false;
    setBgColorState(first.bgColor);
    setActiveObject(null);
    historyRef.current = [first.canvasJSON];
    histCursorRef.current = 0;
    pagesRef.current = merged;
    currentPageIdxRef.current = newIdx;
    setPages([...merged]);
    setCurrentPageIdx(newIdx);
    syncLayers();
  }, [captureCurrentPage, syncLayers]);

  const loadTemplate = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const c = fabricRef.current;
      if (!c) return;

      if (json._pages) {
        const loadedPages: Page[] = (json._pages as Array<{ id: string; bgColor: string; canvasJSON: object }>).map(
          (p) => makePage(JSON.stringify(p.canvasJSON), p.bgColor)
        );
        await appendLoadedPages(loadedPages);
      } else {
        const { _certgen: _, ...canvasJSON } = json as Record<string, unknown>;
        const bg = (json._certgen as { bgColor?: string } | undefined)?.bgColor ?? "#ffffff";
        await appendLoadedPages([makePage(JSON.stringify(canvasJSON), bg)]);
      }
    } catch {
      alert("Could not load template — invalid JSON file.");
    }
  }, [appendLoadedPages]);

  const loadTemplateData = useCallback(async (json: Record<string, unknown>) => {
    const c = fabricRef.current;
    if (!c) return;

    if (json._pages) {
      const loadedPages: Page[] = (json._pages as Array<{ id: string; bgColor: string; canvasJSON: object }>).map(
        (p) => makePage(JSON.stringify(p.canvasJSON), p.bgColor)
      );
      await appendLoadedPages(loadedPages);
    } else {
      const { _certgen: _, ...canvasJSON } = json;
      const bg = (json._certgen as { bgColor?: string } | undefined)?.bgColor ?? "#ffffff";
      await appendLoadedPages([makePage(JSON.stringify(canvasJSON), bg)]);
    }
  }, [appendLoadedPages]);

  // ── Export ────────────────────────────────────────────────────────────────────

  const openExportModal = useCallback(() => {
    const captured = captureCurrentPage();
    const allPages = [...pagesRef.current];
    allPages[currentPageIdxRef.current] = captured;
    pagesRef.current = allPages;
    setExportPages([...allPages]);
    setShowExport(true);
  }, [captureCurrentPage]);

  const handlePrint = useCallback(() => {
    const c = fabricRef.current;
    if (!c) return;
    if (previewModeRef.current) exitPreview();
    const dataURL = c.toDataURL({ format: "png", multiplier: 2 });
    import("@/lib/print").then(({ openPrintWindow }) =>
      openPrintWindow([dataURL], canvasSize)
    );
  }, [canvasSize, exitPreview]);

  // ── Auto-save restore ─────────────────────────────────────────────────────────

  const restoreAutoSave = useCallback(async (record: AutoSaveRecord) => {
    const c = fabricRef.current;
    if (!c) return;
    setAutoSaveRestore(null);
    const s = record.canvasSize;
    c.setDimensions({ width: s.width, height: s.height });
    setCanvasSizeState(s);

    let loadedPages: Page[];
    if (record.pages) {
      loadedPages = record.pages.map((p) => ({ ...p }));
    } else {
      // Legacy record
      loadedPages = [makePage(record.canvasJSON ?? EMPTY_CANVAS_JSON, record.bgColor ?? "#ffffff")];
    }
    await applyLoadedPages(loadedPages, record.currentPageIdx ?? 0);
  }, [applyLoadedPages]);

  // ── Auto-save interval ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(async () => {
      const c = fabricRef.current;
      if (!c || isRestoringRef.current || previewModeRef.current) return;
      try {
        const captured = captureCurrentPage();
        const allPages = [...pagesRef.current];
        allPages[currentPageIdxRef.current] = captured;
        pagesRef.current = allPages;
        setPages([...allPages]);

        await autoSave(
          allPages as SavedPage[],
          currentPageIdxRef.current,
          canvasSize
        );
        setLastSaved(new Date());
      } catch {
        // silently ignore
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [ready, canvasSize, captureCurrentPage]);

  // ── Canvas initialization ─────────────────────────────────────────────────────

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

    // Initialize first page
    const initialJSON = JSON.stringify(canvas.toObject(["data"]));
    const initialPage: Page = makePage(initialJSON, "#ffffff");
    pagesRef.current = [initialPage];
    currentPageIdxRef.current = 0;
    setPages([initialPage]);
    historyRef.current = [initialJSON];
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

    // ── Alignment guides ─────────────────────────────────────────────────────
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
      for (const y of guides.h) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }
      for (const x of guides.v) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
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

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "p") { e.preventDefault(); handlePrint(); return; }

      // Group: Ctrl+G
      if ((e.metaKey || e.ctrlKey) && e.key === "g" && !e.shiftKey && !isEditing) {
        e.preventDefault();
        const active = canvas.getActiveObject();
        if (active?.type === "activeSelection") {
          const objects = (active as fabric.ActiveSelection).getObjects().slice();
          canvas.discardActiveObject();
          objects.forEach((obj) => canvas.remove(obj));
          const group = new fabric.Group(objects);
          canvas.add(group); canvas.setActiveObject(group); canvas.renderAll(); syncLayers(); saveSnapshot();
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
            obj.setCoords(); canvas.add(obj);
          }
          const sel = new fabric.ActiveSelection(objects, { canvas });
          canvas.setActiveObject(sel); canvas.renderAll(); syncLayers(); saveSnapshot();
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
          canvas.add(pasted); canvas.setActiveObject(pasted); canvas.renderAll();
        });
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "=" && !isEditing) { e.preventDefault(); const next = Math.min(MAX_ZOOM, zoomRef.current + 0.1); setZoom(next); zoomRef.current = next; return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "-" && !isEditing) { e.preventDefault(); const next = Math.max(MIN_ZOOM, zoomRef.current - 0.1); setZoom(next); zoomRef.current = next; return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "0" && !isEditing) { e.preventDefault(); setZoom(1); zoomRef.current = 1; return; }

      if ((e.key === "Delete" || e.key === "Backspace") && !isEditing) {
        const obj = canvas.getActiveObject();
        if (obj) { canvas.remove(obj); canvas.discardActiveObject(); canvas.renderAll(); setActiveObject(null); }
      }

      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && !isEditing) {
        const obj = canvas.getActiveObject();
        if (!obj || (obj as { isEditing?: boolean }).isEditing) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        obj.set({ left: (obj.left ?? 0) + dx, top: (obj.top ?? 0) + dy });
        obj.setCoords(); canvas.renderAll();
        clearTimeout((handleKey as unknown as { _t?: ReturnType<typeof setTimeout> })._t);
        (handleKey as unknown as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(() => saveSnapshot(), 400);
      }
    };

    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("keydown", handleKey);
      canvas.dispose();
      fabricRef.current = null;
      setReady(false);
    };
  }, [syncLayers, saveSnapshot, undo, redo, handlePrint]);

  // ── Ctrl+scroll zoom ──────────────────────────────────────────────────────────

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
        xlsxRows={xlsxRows}
        xlsxRowIdx={xlsxRowIdx}
        onXlsxLoad={handleXlsxLoad}
        activeObject={activeObject}
        onGroupSelected={groupSelected}
        onUngroupSelected={ungroupSelected}
        onOpenExport={openExportModal}
        onPrint={handlePrint}
        onSaveTemplate={saveTemplate}
        onLoadTemplate={loadTemplate}
        onOpenBulk={() => {
          if (previewModeRef.current) exitPreview();
          const c = fabricRef.current;
          setBulkTemplateJSON(c ? c.toObject(["data"]) : {});
          setShowBulk(true);
        }}
        onOpenTemplates={() => setShowTemplates(true)}
        lastSaved={lastSaved}
      />

      {/* Auto-save restore banner */}
      {autoSaveRestore && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-200 text-sm text-blue-800 flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="7" cy="7" r="6" /><path d="M7 4v3l2 1.5" />
          </svg>
          <span>
            Auto-save found from <strong>{new Date(autoSaveRestore.savedAt).toLocaleTimeString()}</strong>
            {(autoSaveRestore.pages?.length ?? 1) > 1 && ` (${autoSaveRestore.pages!.length} pages)`}
            {" "}— restore it?
          </span>
          <button onClick={() => restoreAutoSave(autoSaveRestore)} className="px-3 py-1 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors">Restore</button>
          <button onClick={() => setAutoSaveRestore(null)} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-xs hover:bg-blue-200 transition-colors">Dismiss</button>
        </div>
      )}

      {/* Preview mode banner */}
      {previewMode && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6" cy="6" r="5" /><circle cx="6" cy="6" r="2" fill="currentColor" stroke="none" />
          </svg>
          {xlsxRows ? (
            <>
              Preview — row {xlsxRowIdx + 1} of {xlsxRows.length}
              <button
                onClick={() => changeXlsxRow(xlsxRowIdx - 1)}
                disabled={xlsxRowIdx === 0}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-amber-200 disabled:opacity-30 transition-colors font-bold text-sm"
                title="Previous row"
              >‹</button>
              <button
                onClick={() => changeXlsxRow(xlsxRowIdx + 1)}
                disabled={xlsxRowIdx >= xlsxRows.length - 1}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-amber-200 disabled:opacity-30 transition-colors font-bold text-sm"
                title="Next row"
              >›</button>
            </>
          ) : (
            <>Preview mode — variables replaced with sample data. Edits and auto-save are paused.</>
          )}
          <button onClick={togglePreviewMode} className="ml-2 underline hover:no-underline">Exit</button>
        </div>
      )}

      {/* No-variables toast */}
      {previewToast && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-orange-50 border-b border-orange-200 text-xs text-orange-700 flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6" cy="6" r="5" /><path d="M6 4v3M6 8.5v.5" strokeLinecap="round" />
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

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Canvas area */}
          <div
            className="flex-1 min-w-0 overflow-hidden bg-gray-300 flex items-center justify-center"
            onWheel={handleWheel}
          >
            <div
              style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
              className="shadow-2xl ring-1 ring-black/10 flex-shrink-0"
            >
              <canvas ref={canvasElRef} />
            </div>
          </div>

          {/* Pages strip */}
          <PagesPanel
            pages={pages}
            currentIdx={currentPageIdx}
            onSelect={switchToPage}
            onAdd={addPage}
            onDuplicate={duplicatePage}
            onDelete={deletePage}
          />
        </div>

        <PropertiesPanel
          activeObject={activeObject}
          fabricRef={fabricRef}
          bgColor={bgColor}
          onBgColorChange={changeBgColor}
        />
      </div>

      {showExport && (
        <ExportModal
          pages={exportPages}
          currentPageIdx={currentPageIdx}
          canvasSize={canvasSize}
          onClose={() => setShowExport(false)}
        />
      )}

      {showBulk && (
        <BulkExportModal
          templateJSON={bulkTemplateJSON}
          canvasSize={canvasSize}
          onClose={() => setShowBulk(false)}
        />
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
