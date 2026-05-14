"use client";

import { useState, useMemo } from "react";
import type { CanvasSize, Page } from "./Editor";

interface Props {
  pages: Page[];
  currentPageIdx: number;
  canvasSize: CanvasSize;
  onClose: () => void;
}

type Format = "pdf" | "png" | "jpeg";
type PageSel = "all" | "current" | "custom";
type OutputMode = "combined" | "separate";

function parseRange(input: string, total: number): number[] {
  if (!input.trim()) return [];
  const set = new Set<number>();
  for (const part of input.split(",")) {
    const t = part.trim();
    const range = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const lo = Math.max(1, parseInt(range[1])) - 1;
      const hi = Math.min(total, parseInt(range[2])) - 1;
      for (let i = lo; i <= hi; i++) set.add(i);
    } else {
      const n = parseInt(t);
      if (!isNaN(n) && n >= 1 && n <= total) set.add(n - 1);
    }
  }
  return [...set].sort((a, b) => a - b);
}

async function renderPage(
  page: { canvasJSON: string; bgColor: string },
  w: number,
  h: number,
  fmt: "png" | "jpeg"
): Promise<string> {
  const fabric = await import("fabric");
  const el = document.createElement("canvas");
  el.style.cssText = "position:fixed;left:-99999px;top:-99999px;visibility:hidden;";
  document.body.appendChild(el);
  const tc = new fabric.Canvas(el, { width: w, height: h, renderOnAddRemove: false });
  await tc.loadFromJSON(JSON.parse(page.canvasJSON));
  tc.backgroundColor = page.bgColor;
  tc.renderAll();
  const url = tc.toDataURL({ format: fmt, multiplier: 3, quality: fmt === "jpeg" ? 0.92 : 1 });
  tc.dispose();
  document.body.removeChild(el);
  return url;
}

function triggerDownload(href: string, filename: string) {
  const a = Object.assign(document.createElement("a"), { href, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function ExportModal({ pages, currentPageIdx, canvasSize, onClose }: Props) {
  const [format, setFormat] = useState<Format>("pdf");
  const [pageSel, setPageSel] = useState<PageSel>("all");
  const [customInput, setCustomInput] = useState("");
  const [outputMode, setOutputMode] = useState<OutputMode>("combined");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const selectedIndices = useMemo<number[]>(() => {
    if (pageSel === "all") return pages.map((_, i) => i);
    if (pageSel === "current") return [currentPageIdx];
    return parseRange(customInput, pages.length);
  }, [pageSel, currentPageIdx, customInput, pages.length]);

  const isSeparate = format === "pdf" && selectedIndices.length > 1 && outputMode === "separate";
  const isMultiImage = format !== "pdf" && selectedIndices.length > 1;
  const outputDesc =
    format === "pdf"
      ? isSeparate
        ? `${selectedIndices.length} PDF files (ZIP)`
        : "1 PDF file"
      : selectedIndices.length === 1
        ? `1 ${format === "jpeg" ? "JPG" : "PNG"} file`
        : `${selectedIndices.length} ${format === "jpeg" ? "JPG" : "PNG"} files (ZIP)`;

  const handleExport = async () => {
    if (!selectedIndices.length || exporting) return;
    setExporting(true);
    const total = selectedIndices.length;
    setProgress({ current: 0, total });

    const { width, height } = canvasSize;
    const sel = selectedIndices.map((i) => ({ page: pages[i], pageNum: i + 1 }));

    try {
      if (format === "pdf") {
        const { default: jsPDF } = await import("jspdf");
        const orientation = width > height ? "landscape" : "portrait";

        if (!isSeparate) {
          // One combined PDF
          const pdf = new jsPDF({ orientation, unit: "px", format: [width, height] });
          for (let i = 0; i < sel.length; i++) {
            setProgress({ current: i + 1, total });
            const dataURL = await renderPage(sel[i].page, width, height, "png");
            if (i > 0) pdf.addPage([width, height], orientation);
            pdf.addImage(dataURL, "PNG", 0, 0, width, height);
          }
          const name =
            pageSel === "all"
              ? "certificate-all-pages.pdf"
              : `certificate-pages-${selectedIndices.map((i) => i + 1).join(",")}.pdf`;
          pdf.save(name);
        } else {
          // Separate PDFs → ZIP
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();
          for (let i = 0; i < sel.length; i++) {
            setProgress({ current: i + 1, total });
            const dataURL = await renderPage(sel[i].page, width, height, "png");
            const pdf = new jsPDF({ orientation, unit: "px", format: [width, height] });
            pdf.addImage(dataURL, "PNG", 0, 0, width, height);
            zip.file(`certificate-page-${sel[i].pageNum}.pdf`, pdf.output("blob"));
          }
          const blob = await zip.generateAsync({ type: "blob" });
          triggerDownload(URL.createObjectURL(blob), "certificates-separate.zip");
        }
      } else {
        // PNG / JPEG
        const ext = format === "jpeg" ? "jpg" : "png";
        if (selectedIndices.length === 1) {
          setProgress({ current: 1, total: 1 });
          const dataURL = await renderPage(sel[0].page, width, height, format);
          triggerDownload(dataURL, `certificate-page-${sel[0].pageNum}.${ext}`);
        } else {
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();
          for (let i = 0; i < sel.length; i++) {
            setProgress({ current: i + 1, total });
            const dataURL = await renderPage(sel[i].page, width, height, format);
            zip.file(`certificate-page-${sel[i].pageNum}.${ext}`, dataURL.split(",")[1], { base64: true });
          }
          const blob = await zip.generateAsync({ type: "blob" });
          triggerDownload(URL.createObjectURL(blob), `certificates.zip`);
        }
      }
      onClose();
    } catch (err) {
      console.error("Export failed", err);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[460px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-base">Export</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M1 1l11 11M12 1L1 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ── Format ── */}
          <section>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Format</p>
            <div className="flex gap-2">
              {(["pdf", "png", "jpeg"] as Format[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-semibold tracking-wide transition-colors ${
                    format === f
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {f === "jpeg" ? "JPG" : f.toUpperCase()}
                </button>
              ))}
            </div>
          </section>

          {/* ── Pages ── */}
          <section>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Pages</p>
            <div className="space-y-2.5">
              {([
                { value: "all", label: `All pages`, sub: `${pages.length} page${pages.length !== 1 ? "s" : ""}` },
                { value: "current", label: "Current page", sub: `Page ${currentPageIdx + 1}` },
                { value: "custom", label: "Custom range", sub: `e.g. 1, 3, 5-${pages.length}` },
              ] as { value: PageSel; label: string; sub: string }[]).map(({ value, label, sub }) => (
                <label key={value} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="page-sel"
                    value={value}
                    checked={pageSel === value}
                    onChange={() => setPageSel(value)}
                    className="mt-0.5 accent-blue-600"
                  />
                  <span>
                    <span className="text-sm text-gray-800">{label}</span>
                    <span className="text-xs text-gray-400 ml-2">{sub}</span>
                  </span>
                </label>
              ))}
            </div>

            {pageSel === "custom" && (
              <div className="mt-3">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder={`e.g. 1, 3, 5-${pages.length}`}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  autoFocus
                />
                {customInput.trim() && (
                  <p className={`text-xs mt-1.5 ${selectedIndices.length ? "text-gray-500" : "text-red-500"}`}>
                    {selectedIndices.length
                      ? `Selected: page${selectedIndices.length !== 1 ? "s" : ""} ${selectedIndices.map((i) => i + 1).join(", ")}`
                      : "No valid pages — enter numbers between 1 and " + pages.length}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ── Output mode (PDF + multiple pages only) ── */}
          {format === "pdf" && selectedIndices.length > 1 && (
            <section>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Output</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setOutputMode("combined")}
                  className={`flex-1 py-2.5 px-3 rounded-lg border text-left transition-colors ${
                    outputMode === "combined"
                      ? "bg-blue-50 border-blue-400"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <p className={`text-sm font-medium ${outputMode === "combined" ? "text-blue-700" : "text-gray-700"}`}>
                    Single PDF
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">All selected pages in one file</p>
                </button>
                <button
                  onClick={() => setOutputMode("separate")}
                  className={`flex-1 py-2.5 px-3 rounded-lg border text-left transition-colors ${
                    outputMode === "separate"
                      ? "bg-blue-50 border-blue-400"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <p className={`text-sm font-medium ${outputMode === "separate" ? "text-blue-700" : "text-gray-700"}`}>
                    Separate files
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">One PDF per page, downloaded as ZIP</p>
                </button>
              </div>
            </section>
          )}

          {/* ── Summary ── */}
          {selectedIndices.length > 0 && !progress && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 text-xs text-gray-600">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0 text-blue-500">
                <path d="M2 11V5l5-3 5 3v6a1 1 0 01-1 1H3a1 1 0 01-1-1z" strokeLinecap="round" />
                <path d="M5 14V9h4v5" strokeLinecap="round" />
              </svg>
              <span>
                <span className="font-medium text-gray-800">{selectedIndices.length}</span> page{selectedIndices.length !== 1 ? "s" : ""} → {outputDesc}
              </span>
            </div>
          )}

          {/* ── Progress bar ── */}
          {progress && (
            <div className="py-1">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span>Rendering page {progress.current} of {progress.total}…</span>
                <span className="font-medium">{Math.round((progress.current / progress.total) * 100)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          {!exporting && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={!selectedIndices.length || exporting}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
