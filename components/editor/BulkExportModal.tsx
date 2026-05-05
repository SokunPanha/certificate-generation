"use client";

import { useState, useRef, RefObject } from "react";
import type { Canvas, Textbox } from "fabric";
import { bulkExportZip, BulkProgress } from "@/lib/bulkExport";

interface Props {
  fabricRef: RefObject<Canvas | null>;
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

function getSample(varName: string, rowIdx: number): string {
  const values = SAMPLE_DATA[varName];
  return values ? values[rowIdx % values.length] : `${varName}_${rowIdx + 1}`;
}

function extractVarsFromCanvas(canvas: Canvas): string[] {
  const found = new Set<string>();
  const RE = /\{\{(\w+)\}\}/g;
  for (const obj of canvas.getObjects()) {
    if (["textbox", "text", "i-text"].includes(obj.type ?? "")) {
      for (const m of ((obj as Textbox).text ?? "").matchAll(RE)) found.add(m[1]);
    }
  }
  return [...found];
}

async function downloadSampleXLSX(vars: string[]) {
  const XLSX = await import("xlsx");
  const header = vars;
  const rows = [0, 1].map((i) => vars.map((v) => getSample(v, i)));
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

  // Style header row bold (column widths for readability)
  ws["!cols"] = vars.map(() => ({ wch: 20 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Certificates");
  XLSX.writeFile(wb, "certificate-sample.xlsx");
}

async function parseXLSX(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: "" });
  if (!raw.length) return { headers: [], rows: [] };
  const headers = Object.keys(raw[0]);
  const rows = raw.map((r) =>
    Object.fromEntries(headers.map((h) => [h, String(r[h] ?? "")])) as Record<string, string>
  );
  return { headers, rows };
}

export default function BulkExportModal({ fabricRef, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const canvasVars = fabricRef.current ? extractVarsFromCanvas(fabricRef.current) : [];
  const hasVars = canvasVars.length > 0;

  const handleDownloadSample = async () => {
    const vars = hasVars ? canvasVars : DEFAULT_VARS;
    await downloadSampleXLSX(vars);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setDone(false);
    setProgress(null);
    try {
      const { headers: h, rows: r } = await parseXLSX(file);
      if (!r.length) { setError("File is empty or could not be read."); return; }
      setHeaders(h);
      setRows(r);
    } catch (err) {
      setError(String(err));
    }
    e.target.value = "";
  };

  const handleGenerate = async () => {
    const c = fabricRef.current;
    if (!c || !rows.length) return;
    setError("");
    setDone(false);
    setProgress({ current: 0, total: rows.length, label: "Starting…" });
    try {
      await bulkExportZip(c.toObject(["data"]), rows, c.getWidth(), c.getHeight(), setProgress);
      setDone(true);
    } catch (err) {
      setError(String(err));
      setProgress(null);
    }
  };

  const running = !!progress && !done;
  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-800">Bulk Certificate Generation</h2>
          <button
            onClick={onClose}
            disabled={running}
            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-30"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">

          {/* Step 1 */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <StepBadge n={1} />
              <h3 className="text-sm font-medium text-gray-700">Variables detected in your design</h3>
            </div>
            {hasVars ? (
              <div className="ml-7">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {canvasVars.map((v) => (
                    <code key={v} className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded border border-amber-200 font-mono">
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
                <p className="text-xs text-gray-400">These will become the Excel column headers.</p>
              </div>
            ) : (
              <p className="ml-7 text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 leading-5">
                No <span className="font-mono">{"{{variables}}"}</span> found in your design yet.
                The sample will use default columns instead.
              </p>
            )}
          </section>

          {/* Step 2 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <StepBadge n={2} />
              <h3 className="text-sm font-medium text-gray-700">Download sample Excel, fill it in, upload</h3>
            </div>

            {/* Download */}
            <button
              onClick={handleDownloadSample}
              className="ml-7 flex items-center gap-2 px-4 py-2.5 bg-green-50 hover:bg-green-100 text-green-700 text-sm rounded-xl transition-colors"
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 15 15">
                <path d="M7.5 2v7M4.5 6l3 3 3-3M2.5 12h10" />
              </svg>
              Download Sample Excel (.xlsx)
            </button>
            <p className="ml-7 mt-1.5 text-xs text-gray-400">
              {hasVars
                ? <>Columns: <span className="font-mono">{canvasVars.join(", ")}</span></>
                : <>Default columns: <span className="font-mono">name, grade, class, rank…</span></>}
            </p>

            <div className="ml-7 my-4 flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400">fill in your data, then upload</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* Upload */}
            <button
              onClick={() => fileRef.current?.click()}
              className="ml-7 flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:text-blue-600 text-gray-600 text-sm rounded-xl transition-colors"
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 15 15">
                <path d="M7.5 10V3M4.5 6l3-3 3 3M2.5 12h10" />
              </svg>
              {rows.length > 0
                ? `${rows.length} rows loaded — choose a different file`
                : "Upload Excel (.xlsx)"}
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />

            {/* Preview table */}
            {rows.length > 0 && (
              <div className="ml-7 mt-3 rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {headers.map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-gray-600 font-semibold whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          {headers.map((h) => (
                            <td key={h} className="px-3 py-2 text-gray-700 whitespace-nowrap">{row[h]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 3 && (
                  <div className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50 border-t border-gray-100 text-center">
                    + {rows.length - 3} more rows
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Step 3 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <StepBadge n={3} />
              <h3 className="text-sm font-medium text-gray-700">Generate &amp; download ZIP</h3>
            </div>

            {error && (
              <div className="ml-7 mb-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
            )}

            {progress && (
              <div className="ml-7 mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span className="truncate">{progress.label}</span>
                  <span className="ml-2 flex-shrink-0">{pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full transition-all duration-200" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}

            {done && (
              <div className="ml-7 mb-3 text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3 flex items-center gap-2">
                <span>✓</span>
                <span>{rows.length} certificates exported — check your Downloads folder.</span>
              </div>
            )}

            <div className="ml-7">
              <button
                onClick={handleGenerate}
                disabled={!rows.length || running}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
              >
                {running
                  ? `Generating ${progress!.current} / ${progress!.total}…`
                  : `Generate ${rows.length > 0 ? `${rows.length} ` : ""}Certificates`}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center justify-center font-bold flex-shrink-0">
      {n}
    </span>
  );
}
