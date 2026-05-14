"use client";

import { useEffect, useState, useCallback, RefObject } from "react";
import type { Canvas, Object as FabricObject, Textbox } from "fabric";
import { HexColorPicker } from "react-colorful";
import { loadFont } from "@/lib/fonts";
import FontPicker from "./FontPicker";

interface Props {
  activeObject: FabricObject | null;
  fabricRef: RefObject<Canvas | null>;
  bgColor: string;
  onBgColorChange: (color: string) => void;
}

function isTextObj(obj: FabricObject | null): obj is Textbox {
  return (
    !!obj &&
    (obj.type === "textbox" || obj.type === "text" || obj.type === "i-text")
  );
}

export default function PropertiesPanel({ activeObject, fabricRef, bgColor, onBgColorChange }: Props) {
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontSize, setFontSize] = useState(28);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [color, setColor] = useState("#000000");
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">(
    "left"
  );
  const [opacity, setOpacity] = useState(100);
  const [showPicker, setShowPicker] = useState(false);

  // Sync panel state when selection changes
  useEffect(() => {
    if (!activeObject) return;

    setOpacity(Math.round((activeObject.opacity ?? 1) * 100));

    if (isTextObj(activeObject)) {
      const t = activeObject as Textbox;
      setFontFamily((t.fontFamily as string) || "Arial");
      setFontSize((t.fontSize as number) || 28);
      setBold(t.fontWeight === "bold");
      setItalic(t.fontStyle === "italic");
      setUnderline(t.underline ?? false);
      setColor((t.fill as string) || "#000000");
      setTextAlign(
        ((t.textAlign as string) || "left") as "left" | "center" | "right"
      );
    }
  }, [activeObject]);

  const handleFont = useCallback(async (family: string) => {
    setFontFamily(family);
    await loadFont(family);
    if (!activeObject) return;
    activeObject.set({ fontFamily: family });
    const maybeText = activeObject as unknown as { initDimensions?: () => void };
    if (typeof maybeText.initDimensions === "function") {
      maybeText.initDimensions();
    }
    fabricRef.current?.renderAll();
  }, [activeObject, fabricRef]);

  const handleSize = useCallback((size: number) => {
    setFontSize(size);
    if (!activeObject) return;
    activeObject.set({ fontSize: size });
    fabricRef.current?.renderAll();
  }, [activeObject, fabricRef]);

  const handleBold = useCallback(() => {
    const next = !bold;
    setBold(next);
    if (!activeObject) return;
    activeObject.set({ fontWeight: next ? "bold" : "normal" });
    fabricRef.current?.renderAll();
  }, [bold, activeObject, fabricRef]);

  const handleItalic = useCallback(() => {
    const next = !italic;
    setItalic(next);
    if (!activeObject) return;
    activeObject.set({ fontStyle: next ? "italic" : "normal" });
    fabricRef.current?.renderAll();
  }, [italic, activeObject, fabricRef]);

  const handleUnderline = useCallback(() => {
    const next = !underline;
    setUnderline(next);
    if (!activeObject) return;
    activeObject.set({ underline: next });
    fabricRef.current?.renderAll();
  }, [underline, activeObject, fabricRef]);

  const handleColor = useCallback((c: string) => {
    setColor(c);
    if (!activeObject) return;
    activeObject.set({ fill: c });
    fabricRef.current?.renderAll();
  }, [activeObject, fabricRef]);

  const handleAlign = useCallback((align: "left" | "center" | "right") => {
    setTextAlign(align);
    if (!activeObject) return;
    activeObject.set({ textAlign: align });
    fabricRef.current?.renderAll();
  }, [activeObject, fabricRef]);

  const handleOpacity = useCallback((val: number) => {
    setOpacity(val);
    if (!activeObject) return;
    activeObject.set({ opacity: val / 100 });
    fabricRef.current?.renderAll();
  }, [activeObject, fabricRef]);

  const isWatermark =
    (activeObject as unknown as { data?: { role?: string } })?.data?.role ===
    "watermark";

  if (!activeObject) {
    return (
      <aside className="w-64 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-y-auto">
        <div className="px-4 py-2 border-b border-gray-100">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Canvas</h2>
        </div>
        <div className="p-4 space-y-5">
          <section className="relative">
            <label className="text-xs text-gray-500 mb-1 block">Background Color</label>
            <button
              onClick={() => setShowPicker((v) => !v)}
              className="flex items-center gap-2 w-full border border-gray-200 rounded-md px-2 py-1.5 hover:bg-gray-50 transition-colors"
            >
              <span
                className="w-5 h-5 rounded border border-gray-300 flex-shrink-0"
                style={{ backgroundColor: bgColor }}
              />
              <span className="text-sm text-gray-700 font-mono">{bgColor.toUpperCase()}</span>
            </button>
            {showPicker && (
              <div className="absolute left-0 z-50 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 space-y-2">
                <HexColorPicker color={bgColor} onChange={onBgColorChange} />
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => onBgColorChange(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={() => setShowPicker(false)}
                  className="w-full py-1.5 text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-md transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </section>
          <p className="text-xs text-gray-400 leading-5">
            Select an element to edit its properties.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-y-auto">
      <div className="px-4 py-2 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Properties
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Opacity */}
        <section>
          <label className="text-xs text-gray-500 mb-1 flex items-center justify-between">
            <span>Opacity {isWatermark && <span className="text-purple-500 ml-1">(Watermark)</span>}</span>
            <span className="font-medium text-gray-700">{opacity}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => handleOpacity(Number(e.target.value))}
            className="w-full accent-blue-600"
          />
        </section>

        {/* Text-only properties */}
        {isTextObj(activeObject) && (
          <>
            <div className="h-px bg-gray-100" />

            {/* Font Family */}
            <section>
              <label className="text-xs text-gray-500 mb-1 block">
                Font Family
              </label>
              <FontPicker value={fontFamily} onChange={handleFont} />
            </section>

            {/* Font Size */}
            <section>
              <label className="text-xs text-gray-500 mb-1 flex items-center justify-between">
                <span>Font Size</span>
                <span className="font-medium text-gray-700">{fontSize}px</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={6}
                  max={200}
                  value={fontSize}
                  onChange={(e) => handleSize(Number(e.target.value))}
                  className="w-16 text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <input
                  type="range"
                  min={6}
                  max={120}
                  value={fontSize}
                  onChange={(e) => handleSize(Number(e.target.value))}
                  className="flex-1 accent-blue-600"
                />
              </div>
            </section>

            {/* Style */}
            <section>
              <label className="text-xs text-gray-500 mb-1 block">Style</label>
              <div className="flex gap-1.5">
                {[
                  { label: "B", active: bold, action: handleBold, cls: "font-bold" },
                  { label: "I", active: italic, action: handleItalic, cls: "italic" },
                  { label: "U", active: underline, action: handleUnderline, cls: "underline" },
                ].map(({ label, active, action, cls }) => (
                  <button
                    key={label}
                    onClick={action}
                    className={`w-9 h-9 rounded-md border text-sm ${cls} transition-colors ${
                      active
                        ? "bg-blue-100 border-blue-400 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {/* Alignment */}
            <section>
              <label className="text-xs text-gray-500 mb-1 block">
                Alignment
              </label>
              <div className="flex gap-1.5">
                {(["left", "center", "right"] as const).map((align) => (
                  <button
                    key={align}
                    onClick={() => handleAlign(align)}
                    className={`flex-1 h-9 rounded-md border text-xs transition-colors ${
                      textAlign === align
                        ? "bg-blue-100 border-blue-400 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                    title={align}
                  >
                    {align === "left" ? "⬅" : align === "center" ? "↔" : "➡"}
                  </button>
                ))}
              </div>
            </section>

            {/* Color */}
            <section className="relative">
              <label className="text-xs text-gray-500 mb-1 block">
                Text Color
              </label>
              <button
                onClick={() => setShowPicker((v) => !v)}
                className="flex items-center gap-2 w-full border border-gray-200 rounded-md px-2 py-1.5 hover:bg-gray-50 transition-colors"
              >
                <span
                  className="w-5 h-5 rounded border border-gray-300 flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm text-gray-700 font-mono">
                  {color.toUpperCase()}
                </span>
              </button>

              {showPicker && (
                <div className="absolute left-0 z-50 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 space-y-2">
                  <HexColorPicker color={color} onChange={handleColor} />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => handleColor(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <button
                    onClick={() => setShowPicker(false)}
                    className="w-full py-1.5 text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-md transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {/* Image hint */}
        {activeObject?.type === "image" && !isTextObj(activeObject) && (
          <p className="text-xs text-gray-400 leading-5">
            Use the <strong>Opacity</strong> slider above to adjust
            transparency.
            <br />
            Drag the image to reposition it.
          </p>
        )}
      </div>
    </aside>
  );
}
