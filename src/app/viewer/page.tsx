"use client";

import { useEffect } from "react";

export default function ViewerPage() {
  useEffect(() => {
    // public/index.htmlを読み込む
    window.location.href = "/index.html";
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="text-center">
        <p>Loading VRM Viewer...</p>
        <p className="text-sm text-gray-400 mt-2">
          If you are not redirected,{" "}
          <a href="/index.html" className="text-blue-400 underline">
            click here
          </a>
        </p>
      </div>
    </div>
  );
}
