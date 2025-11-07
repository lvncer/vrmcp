"use client";

import { useEffect, useRef, useState } from "react";

export default function ViewerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<{ text: string; connected: boolean }>({
    text: "Connecting...",
    connected: false,
  });
  const [modelName, setModelName] = useState("Not loaded");
  const [animationName, setAnimationName] = useState("None");

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    const initViewer = async () => {
      if (!canvasRef.current) return;

      // Dynamic imports for Three.js and VRM
      const THREE = await import("three");
      const { VRM, VRMLoaderPlugin } = await import("@pixiv/three-vrm");
      const { GLTFLoader } = await import(
        "three/examples/jsm/loaders/GLTFLoader.js"
      );

      // Three.js initialization
      const canvas = canvasRef.current;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x212121);

      // Grid helper
      const gridHelper = new THREE.GridHelper(10, 10);
      scene.add(gridHelper);

      // Axes helper
      const axesHelper = new THREE.AxesHelper(5);
      scene.add(axesHelper);

      // Camera
      const camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        100
      );
      camera.position.set(0, 1.5, 5);
      camera.lookAt(0, 1, 0);

      // Lights
      const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
      directionalLight.position.set(1, 1, 1);
      scene.add(directionalLight);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
      scene.add(ambientLight);

      // VRM management
      let vrm: VRM | null = null;
      let mixer: THREE.AnimationMixer | null = null;
      const loadedAnimations = new Map();
      let currentAction: THREE.AnimationAction | null = null;

      // VRM loader
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      // SSE connection
      let eventSource: EventSource | null = null;

      function connectSSE() {
        eventSource = new EventSource("/api/viewer/sse");

        eventSource.onopen = () => {
          console.log("✓ SSE接続成功");
          setStatus({ text: "Connected", connected: true });
        };

        eventSource.onerror = (error) => {
          console.error("SSE error:", error);
          setStatus({ text: "Disconnected", connected: false });

          // Auto reconnect after 5 seconds
          setTimeout(() => {
            if (eventSource?.readyState === EventSource.CLOSED) {
              console.log("🔄 SSE再接続中...");
              connectSSE();
            }
          }, 5000);
        };

        // Generic message handler
        eventSource.addEventListener("message", async (event) => {
          const message = JSON.parse(event.data);
          console.log("📨 受信 (message):", message);
          await handleMessage(message);
        });

        // Specific event handlers
        eventSource.addEventListener("init", async (event) => {
          const data = JSON.parse(event.data);
          console.log("📨 受信 (init):", data);
          if (data.isLoaded) {
            setModelName(data.modelPath);
          }
        });

        eventSource.addEventListener("load_vrm_model", async (event) => {
          const data = JSON.parse(event.data);
          console.log("📨 受信 (load_vrm_model):", data);
          await handleMessage({ type: "load_vrm_model", data });
        });

        eventSource.addEventListener("set_vrm_expression", async (event) => {
          const data = JSON.parse(event.data);
          console.log("📨 受信 (set_vrm_expression):", data);
          await handleMessage({ type: "set_vrm_expression", data });
        });

        eventSource.addEventListener("animate_vrm_bone", async (event) => {
          const data = JSON.parse(event.data);
          console.log("📨 受信 (animate_vrm_bone):", data);
          await handleMessage({ type: "animate_vrm_bone", data });
        });

        eventSource.addEventListener("set_vrm_pose", async (event) => {
          const data = JSON.parse(event.data);
          console.log("📨 受信 (set_vrm_pose):", data);
          await handleMessage({ type: "set_vrm_pose", data });
        });

        eventSource.addEventListener("load_vrma_animation", async (event) => {
          const data = JSON.parse(event.data);
          console.log("📨 受信 (load_vrma_animation):", data);
          await handleMessage({ type: "load_vrma_animation", data });
        });

        eventSource.addEventListener("play_vrma_animation", async (event) => {
          const data = JSON.parse(event.data);
          console.log("📨 受信 (play_vrma_animation):", data);
          await handleMessage({ type: "play_vrma_animation", data });
        });

        eventSource.addEventListener("stop_vrma_animation", async (event) => {
          const data = JSON.parse(event.data);
          console.log("📨 受信 (stop_vrma_animation):", data);
          await handleMessage({ type: "stop_vrma_animation", data });
        });
      }

      // Message handler function
      async function handleMessage(message: any) {
        console.log("📨 処理:", message);

        try {
          switch (message.type) {
            case "init":
              if (message.data.isLoaded) {
                setModelName(message.data.modelPath);
              }
              break;

            case "load_vrm_model":
              setStatus({ text: "Loading VRM...", connected: true });
              console.log("🔄 VRM読み込み開始:", message.data.filePath);

              const gltf = await loader.loadAsync(message.data.filePath);
              vrm = gltf.userData.vrm;

              if (!vrm) {
                throw new Error("VRMデータが見つかりません");
              }

              console.log("📦 VRMデータ取得成功:", vrm);
              console.log("📏 VRMシーンの子要素数:", vrm.scene.children.length);

              // Calculate VRM bounding box
              const bbox = new THREE.Box3().setFromObject(vrm.scene);
              const size = bbox.getSize(new THREE.Vector3());
              const center = bbox.getCenter(new THREE.Vector3());

              console.log("📐 VRMサイズ:", size);
              console.log("📍 VRM中心:", center);
              console.log("🎯 VRM位置:", vrm.scene.position);

              scene.add(vrm.scene);
              console.log("✅ シーンに追加完了");

              // Initialize AnimationMixer
              mixer = new THREE.AnimationMixer(vrm.scene);

              console.log("✓ VRMモデル読み込み完了");
              setStatus({ text: "VRM Loaded", connected: true });
              setModelName(message.data.filePath.split("/").pop() || "Unknown");
              break;

            case "set_vrm_expression":
              if (vrm?.expressionManager) {
                vrm.expressionManager.setValue(
                  message.data.expression,
                  message.data.weight
                );
                console.log(
                  `😊 表情設定: ${message.data.expression} = ${message.data.weight}`
                );
              }
              break;

            case "animate_vrm_bone":
              if (vrm?.humanoid) {
                const bone = vrm.humanoid.getNormalizedBoneNode(
                  message.data.boneName
                );
                if (bone) {
                  const { x, y, z, w } = message.data.rotation;
                  bone.quaternion.set(x, y, z, w);
                  console.log(`🦴 ボーン回転: ${message.data.boneName}`);
                }
              }
              break;

            case "set_vrm_pose":
              if (vrm) {
                if (message.data.position) {
                  const { x, y, z } = message.data.position;
                  vrm.scene.position.set(x, y, z);
                }
                if (message.data.rotation) {
                  const { x, y, z } = message.data.rotation;
                  vrm.scene.rotation.set(x, y, z);
                }
                console.log("📍 ポーズ更新");
              }
              break;

            case "load_vrma_animation":
            case "play_vrma_animation":
            case "stop_vrma_animation":
              console.log(`⚠️ VRMA機能は現在無効です: ${message.type}`);
              setStatus({ text: "VRMA機能は未実装", connected: true });
              break;
          }
        } catch (error) {
          console.error("エラー:", error);
          setStatus({
            text: `Error: ${(error as Error).message}`,
            connected: false,
          });
        }
      }

      // Start SSE connection
      connectSSE();

      // Animation loop
      const clock = new THREE.Clock();

      function animate() {
        requestAnimationFrame(animate);

        const deltaTime = clock.getDelta();

        // VRM update
        if (vrm) {
          vrm.update(deltaTime);
        }

        // AnimationMixer update (for VRMA playback)
        if (mixer) {
          mixer.update(deltaTime);
        }

        renderer.render(scene, camera);
      }

      animate();

      // Window resize handler
      const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };

      window.addEventListener("resize", handleResize);

      console.log("🎭 VRM Viewer initialized");
      console.log("📡 Waiting for VRM commands...");

      // Cleanup function
      cleanup = () => {
        window.removeEventListener("resize", handleResize);
        if (eventSource) {
          eventSource.close();
        }
        renderer.dispose();
      };
    };

    initViewer();

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#1a1a1a]">
      <canvas ref={canvasRef} className="w-full h-full block" />
      
      {/* Info Panel */}
      <div className="absolute top-5 left-5 text-white font-mono bg-black/80 px-5 py-4 rounded-[10px] backdrop-blur-[10px] border border-white/10 max-w-[400px] text-[13px] leading-[1.6] shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="text-base font-bold mb-2.5 text-[#00d4ff]">
          🎭 VRM Viewer (VRMA対応)
        </div>
        <div className="my-1.5 text-[#ccc]">
          <span
            className={`inline-block w-2 h-2 rounded-full mr-2 ${
              status.connected ? "bg-[#00ff00]" : "bg-[#ff0000]"
            } animate-pulse`}
          />
          <strong className="text-white">Status:</strong>{" "}
          <span>{status.text}</span>
        </div>
        <div className="my-1.5 text-[#ccc]">
          <strong className="text-white">Model:</strong>{" "}
          <span>{modelName}</span>
        </div>
        <div className="my-1.5 text-[#ccc]">
          <strong className="text-white">Animation:</strong>{" "}
          <span>{animationName}</span>
        </div>
      </div>
    </div>
  );
}
