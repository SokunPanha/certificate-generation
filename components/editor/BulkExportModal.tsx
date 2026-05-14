"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { bulkExport, renderRow, type BulkProgress, type ExportMode } from "@/lib/bulkExport";
import { openPrintWindow } from "@/lib/print";
import type { CanvasSize } from "./Editor";

interface Props {
  templateJSON: object;
  canvasSize: CanvasSize;
  onClose: () => void;
}

const DEFAULT_VARS = ["name", "grade", "class", "rank", "school", "date", "result", "year"];

const SAMPLE_DATA: Record<string, string[]> = {
  name:     ["កុសល ពិសិដ្ឋ", "សោភា រតនា"],
  grade:    ["A", "B+"],
  class:    ["7A", "7B"],
  rank:     ["1", "2"],
  school:   ["វិទ្យាល័យ ហ៊ុន សែន ខេច", "វិទ្យាល័យ ហ៊ុន សែន ខេច"],
  date:     ["23 មីនា 2026", "23 មីនា 2026"],
  result:   ["និទ្ទេស C", "និទ្ទេស B"],
  year:     ["2025-2026", "2025-2026"],
  semester: ["1", "1"],
  gender:   ["ប្រុស", "ស្រី"],
};

function getSample(v: string, i: number) {
  const arr = SAMPLE_DATA[v];
  return arr ? arr[i % arr.length] : `${v}_${i + 1}`;
}

function extractVarsFromJSON(json: object): string[] {
  const found = new Set<string>();
  for (const m of JSON.stringify(json).matchAll(/\{\{(\w+)\}\}/g)) found.add(m[1]);
  return [...found];
}

async function downloadSampleXLSX(vars: string[]) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([vars, ...[0, 1].map((i) => vars.map((v) => getSample(v, i)))]);
  ws["!cols"] = vars.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Certificates");
  XLSX.writeFile(wb, "certificate-sample.xlsx");
}

async function parseXLSX(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: "" });
  if (!raw.length) return { headers: [], rows: [] };
  const headers = Object.keys(raw[0]);
  return {
    headers,
    rows: raw.map((r) =>
      Object.fromEntries(headers.map((h) => [h, String(r[h] ?? "")])) as Record<string, string>
    ),
  };
}

export default function BulkExportModal({ templateJSON, canvasSize, onClose }: Props) {
  const fileRef      = useRef<HTMLInputElement>(null);
  const rowListRef   = useRef<HTMLDivElement>(null);
  const renderIdRef  = useRef(0);
  const pageInputRef = useRef<HTMLInputElement>(null);

  const [headers, setHeaders]       = useState<string[]>([]);
  const [rows, setRows]             = useState<Record<string, string>[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [pageInput, setPageInput]   = useState("1");
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress]         = useState<BulkProgress | null>(null);
  const [done, setDone]                 = useState(false);
  const [error, setError]               = useState("");
  const [mode, setMode]                 = useState<ExportMode>("combined");
  const [printingAll, setPrintingAll]   = useState(false);
  const [printAllPct, setPrintAllPct]   = useState(0);

  const canvasVars = extractVarsFromJSON(templateJSON);
  const hasVars    = canvasVars.length > 0;
  const running    = !!progress && !done;
  const templateStr = JSON.stringify(templateJSON);

  // ── Render current row ────────────────────────────────────────────────────

  const doRender = useCallback(async (row: Record<string, string>, id: number) => {
    setRendering(true);
    setPreviewURL(null);
    try {
      const fabric = await import("fabric");
      const url = await renderRow(fabric, templateStr, row, canvasSize.width, canvasSize.height);
      if (renderIdRef.current === id) setPreviewURL(url);
    } catch (e) {
      if (renderIdRef.current === id) setError(String(e));
    } finally {
      if (renderIdRef.current === id) setRendering(false);
    }
  }, [templateStr, canvasSize]);

  useEffect(() => {
    if (!rows.length) return;
    const id = ++renderIdRef.current;
    doRender(rows[currentIdx], id);
  }, [rows, currentIdx, doRender]);

  // Scroll the active row into view in the sidebar list
  useEffect(() => {
    const el = rowListRef.current?.querySelector(`[data-idx="${currentIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [currentIdx]);

  // Sync page input with currentIdx, but don't overwrite while the user is typing
  useEffect(() => {
    if (document.activeElement !== pageInputRef.current) {
      setPageInput(String(currentIdx + 1));
    }
  }, [currentIdx]);

  const commitPageInput = useCallback(() => {
    const n = parseInt(pageInput, 10);
    if (!isNaN(n) && n >= 1 && n <= rows.length) {
      setCurrentIdx(n - 1);
    } else {
      setPageInput(String(currentIdx + 1));
    }
    pageInputRef.current?.blur();
  }, [pageInput, rows.length, currentIdx]);

  // ── Keyboard navigation ───────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (!rows.length || running) return;
      // Don't intercept arrow keys while the page-number input has focus
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setCurrentIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setCurrentIdx((i) => Math.min(rows.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows.length, running, onClose]);

  // ── File handlers ─────────────────────────────────────────────────────────

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setError(""); setDone(false); setProgress(null); setPreviewURL(null);
    try {
      const { headers: h, rows: r } = await parseXLSX(file);
      if (!r.length) { setError("File is empty or could not be read."); return; }
      setHeaders(h); setRows(r); setCurrentIdx(0);
    } catch (e) { setError(String(e)); }
    e.target.value = "";
  };

  const handleGenerate = async () => {
    if (!rows.length) return;
    setError(""); setDone(false);
    setProgress({ current: 0, total: rows.length, label: "Starting…" });
    try {
      await bulkExport(mode, templateJSON, rows, canvasSize.width, canvasSize.height, setProgress);
      setDone(true);
    } catch (e) { setError(String(e)); setProgress(null); }
  };

  const handlePrintCurrent = () => {
    if (!previewURL) return;
    openPrintWindow([previewURL], canvasSize);
  };

  const handlePrintAll = async () => {
    if (!rows.length) return;
    setPrintingAll(true);
    setPrintAllPct(0);
    setError("");
    const fabric = await import("fabric");
    const urls: string[] = [];
    try {
      for (let i = 0; i < rows.length; i++) {
        const url = await renderRow(fabric, templateStr, rows[i], canvasSize.width, canvasSize.height);
        urls.push(url);
        setPrintAllPct(Math.round(((i + 1) / rows.length) * 100));
        await new Promise((r) => setTimeout(r, 0));
      }
      openPrintWindow(urls, canvasSize);
    } catch (e) {
      setError(String(e));
    } finally {
      setPrintingAll(false);
      setPrintAllPct(0);
    }
  };

  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#e5e7eb" }}>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 h-12 bg-white border-b border-gray-200 shadow-sm shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M9 2L4 7l5 5"/>
          </svg>
          Editor
        </button>

        <div className="h-4 w-px bg-gray-200" />
        <span className="font-semibold text-sm text-gray-800">Bulk Export</span>
        {rows.length > 0 && (
          <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{rows.length} records</span>
        )}

        <div className="flex-1" />

        {running ? (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <svg className="animate-spin w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6" strokeOpacity="0.2"/>
              <path d="M8 2a6 6 0 0 1 6 6" strokeLinecap="round"/>
            </svg>
            {progress!.label} &nbsp;{pct}%
          </div>
        ) : rows.length > 0 ? (
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {(["combined", "zip"] as ExportMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    mode === m ? "bg-white shadow-sm font-medium text-gray-800" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {m === "combined" ? "Combined PDF" : "ZIP"}
                </button>
              ))}
            </div>
            <button
              onClick={handlePrintAll}
              disabled={running || printingAll || rendering}
              title="Print all records"
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {printingAll ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="6" strokeOpacity="0.2"/>
                    <path d="M8 2a6 6 0 0 1 6 6" strokeLinecap="round"/>
                  </svg>
                  Preparing… {printAllPct}%
                </>
              ) : (
                <>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 14 14">
                    <rect x="2" y="5" width="10" height="7" rx="1"/>
                    <path d="M4 5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    <path d="M4 9.5h6M4 11.5h4"/>
                    <circle cx="10.5" cy="7.5" r="0.6" fill="currentColor"/>
                  </svg>
                  Print all
                </>
              )}
            </button>
            <button
              onClick={handleGenerate}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 13 13">
                <path d="M6.5 1v8M4 6.5l2.5 2.5L9 6.5M1 11h11"/>
              </svg>
              Export {rows.length} certificates
            </button>
          </div>
        ) : null}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ── */}
        <div className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-5">

            {/* Data source */}
            <section>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Data Source</p>

              <button onClick={() => fileRef.current?.click()}
                className="w-full text-left flex items-center gap-2 px-3 py-2.5 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:text-blue-600 text-gray-600 text-sm rounded-xl transition-colors"
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 14 14">
                  <path d="M7 9.5V2M4.5 5l2.5-3 2.5 3M1.5 11.5h11"/>
                </svg>
                {rows.length > 0 ? `${rows.length} rows — replace` : "Upload Excel (.xlsx)"}
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />

              <button
                onClick={() => downloadSampleXLSX(hasVars ? canvasVars : DEFAULT_VARS)}
                className="mt-1.5 w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 12 12">
                  <path d="M6 1v6.5M3.5 5L6 7.5 8.5 5M1 10h10"/>
                </svg>
                Download sample Excel
              </button>
            </section>

            {/* Variables */}
            <section>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Variables in template</p>
              {hasVars ? (
                <div className="flex flex-wrap gap-1">
                  {canvasVars.map((v) => (
                    <code key={v} className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 font-mono">
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-orange-600 bg-orange-50 px-2.5 py-2 rounded-lg leading-snug">
                  No <span className="font-mono">{"{{variables}}"}</span> found — all certificates will look the same.
                </p>
              )}
            </section>

            {/* Row list */}
            {rows.length > 0 && (
              <section>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Records</p>
                <div ref={rowListRef} className="rounded-xl border border-gray-200 overflow-hidden max-h-64 overflow-y-auto">
                  {rows.map((row, i) => (
                    <button
                      key={i}
                      data-idx={i}
                      onClick={() => setCurrentIdx(i)}
                      className={`w-full text-left flex items-center gap-2 px-3 py-2 text-xs border-b border-gray-100 last:border-0 transition-colors ${
                        i === currentIdx
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="text-gray-400 w-5 text-right shrink-0 tabular-nums">{i + 1}</span>
                      <span className="truncate">{row[headers[0]] ?? `Row ${i + 1}`}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Progress / done / error pinned to bottom of sidebar */}
          {(progress || done || error) && (
            <div className="p-4 border-t border-gray-100 space-y-2 shrink-0">
              {progress && !done && (
                <>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span className="truncate">{progress.label}</span>
                    <span className="ml-2 shrink-0 tabular-nums">{pct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-200"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </>
              )}
              {done && (
                <div className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2">
                  <span>✓</span>
                  <span>{rows.length} certificates exported.</span>
                </div>
              )}
              {error && (
                <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
              )}
            </div>
          )}
        </div>

        {/* ── Preview area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Row nav bar */}
          {rows.length > 0 && (
            <div className="flex items-center justify-center gap-3 h-10 bg-white/80 backdrop-blur-sm border-b border-gray-200 shrink-0">
              <button
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                disabled={currentIdx === 0 || running}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
                title="Previous (← arrow)"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M8 2L3 6l5 4"/>
                </svg>
              </button>

              <span className="flex items-center gap-1 text-sm text-gray-600 select-none">
                <input
                  ref={pageInputRef}
                  type="text"
                  inputMode="numeric"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={commitPageInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitPageInput(); }
                    if (e.key === "Escape") { setPageInput(String(currentIdx + 1)); pageInputRef.current?.blur(); }
                  }}
                  disabled={running || !rows.length}
                  className="w-10 text-center font-semibold text-gray-900 tabular-nums bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 pb-px"
                  title="Type a row number and press Enter"
                />
                <span className="text-gray-400">/ {rows.length}</span>
                {rows[currentIdx] && headers[0] && (
                  <span className="ml-1 text-xs text-gray-400">— {rows[currentIdx][headers[0]]}</span>
                )}
              </span>

              <button
                onClick={() => setCurrentIdx((i) => Math.min(rows.length - 1, i + 1))}
                disabled={currentIdx >= rows.length - 1 || running}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
                title="Next (→ arrow)"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M4 2l5 4-5 4"/>
                </svg>
              </button>

              <div className="h-4 w-px bg-gray-200 mx-1" />

              <button
                onClick={handlePrintCurrent}
                disabled={!previewURL || rendering || printingAll}
                title="Print this record"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 14 14">
                  <rect x="2" y="5" width="10" height="7" rx="1"/>
                  <path d="M4 5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  <path d="M4 9.5h6M4 11.5h4"/>
                  <circle cx="10.5" cy="7.5" r="0.6" fill="currentColor"/>
                </svg>
                Print this
              </button>
            </div>
          )}

          {/* Certificate canvas — Word-style */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-10">
            {rows.length === 0 ? (

              /* Empty state */
              <div className="text-center space-y-4 select-none">
                <div className="w-20 h-20 mx-auto bg-gray-300 rounded-3xl flex items-center justify-center text-gray-400">
                  <svg width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.3" viewBox="0 0 34 34">
                    <rect x="4" y="5" width="26" height="24" rx="2.5"/>
                    <path d="M4 12h26M11 5v7M23 5v7M10 20h14M10 25h8"/>
                  </svg>
                </div>
                <div>
                  <p className="text-gray-600 font-medium">No data loaded</p>
                  <p className="text-gray-400 text-sm mt-1">Upload an Excel file from the sidebar to preview certificates</p>
                </div>
              </div>

            ) : rendering ? (

              /* Loading — sized to the canvas aspect ratio */
              <div
                className="bg-white shadow-2xl rounded flex items-center justify-center"
                style={{
                  width: "100%",
                  maxWidth: Math.min(canvasSize.width, 780),
                  aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
                }}
              >
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <svg className="animate-spin w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.2"/>
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                  </svg>
                  <span className="text-sm">Rendering row {currentIdx + 1}…</span>
                </div>
              </div>

            ) : previewURL ? (

              /* Certificate page — drop-shadow like a real printed page */
              <div
                className="bg-white rounded overflow-hidden"
                style={{
                  width: "100%",
                  maxWidth: Math.min(canvasSize.width, 780),
                  boxShadow: "0 4px 6px -1px rgb(0 0 0/.15), 0 20px 60px -10px rgb(0 0 0/.25)",
                }}
              >
                <img
                  src={previewURL}
                  alt={`Certificate ${currentIdx + 1}`}
                  className="w-full block"
                  draggable={false}
                />
              </div>

            ) : null}
          </div>
        </div>

      </div>
    </div>
  );
}
