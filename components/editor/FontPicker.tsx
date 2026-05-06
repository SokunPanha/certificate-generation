"use client";

import { useState, useRef, useEffect } from "react";
import { FONT_GROUPS, FONTS } from "@/lib/fonts";

interface Props {
  value: string;
  onChange: (family: string) => void;
}

export default function FontPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const openDropdown = () => {
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(true);
    setSearch("");
  };

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!dropdownRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const select = (family: string) => {
    onChange(family);
    setOpen(false);
    setSearch("");
  };

  const query = search.toLowerCase().trim();
  const filtered = query ? FONTS.filter((f) => f.label.toLowerCase().includes(query)) : null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-left flex items-center justify-between hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors"
      >
        <span className="truncate">{value}</span>
        <svg
          className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 ml-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          ref={dropdownRef}
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          className="fixed z-[9999] bg-white border border-gray-200 rounded-md shadow-xl flex flex-col"
        >
          <div className="p-1.5 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fonts…"
              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <div className="overflow-y-auto max-h-64">
            {filtered ? (
              filtered.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No fonts found</p>
              ) : (
                filtered.map((f, i) => (
                  <button
                    key={`search-${f.value}-${i}`}
                    onClick={() => select(f.value)}
                    className={`w-full text-left text-sm px-3 py-1.5 transition-colors ${
                      f.value === value
                        ? "bg-blue-100 text-blue-700 font-medium"
                        : "text-gray-700 hover:bg-blue-50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))
              )
            ) : (
              FONT_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="sticky top-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-1 bg-gray-50 border-b border-gray-100">
                    {group.label}
                  </div>
                  {group.fonts.map((f) => (
                    <button
                      key={`${group.label}-${f.value}`}
                      onClick={() => select(f.value)}
                      className={`w-full text-left text-sm px-3 py-1.5 transition-colors ${
                        f.value === value
                          ? "bg-blue-100 text-blue-700 font-medium"
                          : "text-gray-700 hover:bg-blue-50"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
