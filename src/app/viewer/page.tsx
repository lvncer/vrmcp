"use client";

import { useEffect, useState } from "react";

interface ViewerState {
  isLoaded: boolean;
  modelPath: string | null;
}

interface EventLog {
  id: string;
  timestamp: string;
  type: string;
  data: any;
}

export default function ViewerPage() {
  const [state, setState] = useState<ViewerState>({
    isLoaded: false,
    modelPath: null,
  });
  const [events, setEvents] = useState<EventLog[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource("/api/viewer/sse");

    eventSource.addEventListener("init", (e) => {
      const data = JSON.parse(e.data);
      setState(data);
      setConnected(true);
      addEvent("init", data);
    });

    eventSource.addEventListener("load_vrm_model", (e) => {
      const data = JSON.parse(e.data);
      setState((prev) => ({ ...prev, isLoaded: true, modelPath: data.filePath }));
      addEvent("load_vrm_model", data);
    });

    eventSource.addEventListener("set_vrm_expression", (e) => {
      const data = JSON.parse(e.data);
      addEvent("set_vrm_expression", data);
    });

    eventSource.addEventListener("set_vrm_pose", (e) => {
      const data = JSON.parse(e.data);
      addEvent("set_vrm_pose", data);
    });

    eventSource.addEventListener("animate_vrm_bone", (e) => {
      const data = JSON.parse(e.data);
      addEvent("animate_vrm_bone", data);
    });

    eventSource.addEventListener("load_vrma_animation", (e) => {
      const data = JSON.parse(e.data);
      addEvent("load_vrma_animation", data);
    });

    eventSource.addEventListener("play_vrma_animation", (e) => {
      const data = JSON.parse(e.data);
      addEvent("play_vrma_animation", data);
    });

    eventSource.addEventListener("stop_vrma_animation", (e) => {
      const data = JSON.parse(e.data);
      addEvent("stop_vrma_animation", data);
    });

    eventSource.onerror = () => {
      setConnected(false);
      console.error("SSE connection error");
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const addEvent = (type: string, data: any) => {
    setEvents((prev) => [
      {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        type,
        data,
      },
      ...prev.slice(0, 49), // 最新50件を保持
    ]);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">
          VRM MCP Viewer
        </h1>

        {/* Status Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Status</h2>
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  connected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-sm text-gray-600">
                {connected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Model Status</p>
              <p className="font-medium text-gray-900">
                {state.isLoaded ? "Loaded" : "Not Loaded"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Model Path</p>
              <p className="font-medium text-gray-900">
                {state.modelPath || "N/A"}
              </p>
            </div>
          </div>
        </div>

        {/* Event Log */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Event Log
          </h2>

          {events.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No events yet. Waiting for MCP commands...
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="border border-gray-200 rounded p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-mono text-sm font-medium text-blue-600">
                      {event.type}
                    </span>
                    <span className="text-xs text-gray-500">
                      {event.timestamp}
                    </span>
                  </div>
                  <pre className="text-xs text-gray-700 overflow-x-auto bg-gray-50 p-2 rounded">
                    {JSON.stringify(event.data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

