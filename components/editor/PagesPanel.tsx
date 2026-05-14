"use client";

export interface PageThumb {
  id: string;
  thumbnail: string;
}

interface Props {
  pages: PageThumb[];
  currentIdx: number;
  onSelect: (idx: number) => void;
  onAdd: () => void;
  onDuplicate: (idx: number) => void;
  onDelete: (idx: number) => void;
}

export default function PagesPanel({ pages, currentIdx, onSelect, onAdd, onDuplicate, onDelete }: Props) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 border-t border-gray-200 overflow-x-auto flex-shrink-0 min-h-[84px]">
      {pages.map((page, idx) => (
        <div
          key={page.id}
          className="relative flex-shrink-0 group cursor-pointer select-none"
          onClick={() => onSelect(idx)}
        >
          <div
            className={`w-24 h-16 rounded border-2 overflow-hidden bg-white transition-all ${
              idx === currentIdx
                ? "border-blue-500 shadow-md ring-2 ring-blue-200"
                : "border-gray-300 hover:border-gray-400"
            }`}
          >
            {page.thumbnail ? (
              <img
                src={page.thumbnail}
                alt={`Page ${idx + 1}`}
                className="w-full h-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full bg-white" />
            )}
          </div>

          <div
            className={`text-center text-[10px] mt-0.5 ${
              idx === currentIdx ? "text-blue-600 font-semibold" : "text-gray-500"
            }`}
          >
            {idx + 1}
          </div>

          {/* Hover actions */}
          <div className="absolute top-0.5 right-0.5 hidden group-hover:flex gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(idx); }}
              title="Duplicate page"
              className="w-5 h-5 rounded bg-white shadow-sm border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300 flex items-center justify-center transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <rect x="1" y="3" width="7" height="7" rx="0.7" />
                <path d="M3 3V2a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H8" />
              </svg>
            </button>
            {pages.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(idx); }}
                title="Delete page"
                className="w-5 h-5 rounded bg-white shadow-sm border border-gray-200 text-gray-600 hover:text-red-500 hover:border-red-300 flex items-center justify-center transition-colors"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M1 1l7 7M8 1L1 8" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Add page */}
      <button
        onClick={onAdd}
        title="Add new page"
        className="flex-shrink-0 w-24 h-16 rounded border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:text-blue-500 transition-all"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
        <span className="text-[10px]">Add page</span>
      </button>
    </div>
  );
}
