"use client";

import dynamic from "next/dynamic";

const Editor = dynamic(() => import("./Editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-200">
      <div className="text-sm text-gray-500">Loading editor…</div>
    </div>
  ),
});

export default function EditorWrapper() {
  return <Editor />;
}
