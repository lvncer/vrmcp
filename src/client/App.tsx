import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [modelName, setModelName] = useState<string>('Not loaded');
  const [animationName, setAnimationName] = useState<string>('None');

  useEffect(() => {
    const canvas = canvasRef.current!;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x212121);

    // Helpers
    scene.add(new THREE.GridHelper(10, 10));
    scene.add(new THREE.AxesHelper(5));

    // Camera
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.5, 5);
    camera.lookAt(0, 1, 0);

    // Lights
    const dir = new THREE.DirectionalLight(0xffffff, 2.0);
    dir.position.set(1, 1, 1);
    scene.add(dir);
    const amb = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(amb);

    // VRM
    let vrm: VRM | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let currentAction: THREE.AnimationAction | null = null;
    const loadedAnimations = new Map<string, THREE.AnimationClip>();

    const loader = new GLTFLoader();
    loader.register((parser: any) => new VRMLoaderPlugin(parser));

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    let raf = 0;
    function animate() {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      if (vrm) vrm.update(dt);
      if (mixer) mixer.update(dt);
      renderer.render(scene, camera);
    }

    // SSE
    let es: EventSource | null = null;
    function connectSSE() {
      es = new EventSource('/api/viewer/sse');
      es.onopen = () => setStatus('connected');
      es.onerror = () => {
        setStatus('disconnected');
        setTimeout(() => {
          if (es && es.readyState === EventSource.CLOSED) connectSSE();
        }, 5000);
      };

      es.addEventListener('init', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (data?.isLoaded && data?.modelPath) {
          setModelName(String(data.modelPath));
        }
      });

      es.addEventListener('load_vrm_model', async (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        try {
          const gltf = await loader.loadAsync(data.filePath);
          vrm = (gltf as any).userData.vrm as VRM;
          if (!vrm) throw new Error('VRM data not found');
          scene.add(vrm.scene);
          mixer = new THREE.AnimationMixer(vrm.scene);
          loadedAnimations.clear();
          if (currentAction) {
            currentAction.stop();
            currentAction = null;
          }
          setModelName(String(data.filePath).split('/').pop() || 'Loaded');
        } catch (e) {
          console.error(e);
          setStatus('disconnected');
        }
      });

      es.addEventListener('set_vrm_expression', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (vrm?.expressionManager) {
          vrm.expressionManager.setValue(data.expression, data.weight);
        }
      });

      es.addEventListener('animate_vrm_bone', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (vrm?.humanoid) {
          const bone = vrm.humanoid.getNormalizedBoneNode(data.boneName);
          if (bone) {
            const { x, y, z, w } = data.rotation;
            bone.quaternion.set(x, y, z, w);
          }
        }
      });

      es.addEventListener('set_vrm_pose', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (vrm) {
          if (data.position) {
            const { x, y, z } = data.position;
            vrm.scene.position.set(x, y, z);
          }
          if (data.rotation) {
            const { x, y, z } = data.rotation;
            vrm.scene.rotation.set(x, y, z);
          }
        }
      });

      es.addEventListener('load_gltf_animation', async (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        try {
          const gltf = await loader.loadAsync(data.animationPath);
          const clips: THREE.AnimationClip[] = (gltf as any).animations || [];
          if (clips.length > 0) {
            // ひとまず先頭クリップを登録（複数ある場合は拡張可）
            loadedAnimations.set(data.animationName, clips[0]);
          } else {
            console.warn('No animations found in glTF:', data.animationPath);
          }
        } catch (e) {
          console.error('Failed to load glTF animation:', e);
        }
      });

      es.addEventListener('play_gltf_animation', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (!vrm || !mixer) return;
        const clip = loadedAnimations.get(data.animationName);
        if (!clip) {
          console.warn('Animation not loaded:', data.animationName);
          return;
        }

        const next = mixer.clipAction(clip, vrm.scene);
        next.reset();
        next.setLoop(
          data.loop ? THREE.LoopRepeat : THREE.LoopOnce,
          data.loop ? Infinity : 1
        );
        next.clampWhenFinished = true;
        const fadeIn = typeof data.fadeInDuration === 'number' ? data.fadeInDuration : 0.3;

        if (currentAction && currentAction !== next) {
          currentAction.fadeOut(fadeIn);
        }
        next.fadeIn(fadeIn).play();
        currentAction = next;
        setAnimationName(String(data.animationName));
      });

      es.addEventListener('stop_gltf_animation', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        const fadeOut = typeof data?.fadeOutDuration === 'number' ? data.fadeOutDuration : 0.3;
        if (currentAction) {
          currentAction.fadeOut(fadeOut);
          const toStop = currentAction;
          // 簡易的にフェードアウト後に停止
          setTimeout(() => {
            toStop.stop();
          }, Math.max(0, fadeOut) * 1000 + 50);
          currentAction = null;
          setAnimationName('None');
        }
      });
    }

    connectSSE();
    animate();

    return () => {
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
      if (es) es.close();
      renderer.dispose();
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#1a1a1a' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ position: 'absolute', top: 20, left: 20, color: '#fff', background: 'rgba(0,0,0,.8)', padding: '12px 16px', borderRadius: 8, fontFamily: 'monospace', fontSize: 13 }}>
        <div style={{ marginBottom: 8, color: '#00d4ff', fontWeight: 700 }}>VRM Viewer (glTF対応)</div>
        <div style={{ marginBottom: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 8, background: status === 'connected' ? '#0f0' : '#f00' }} />
          <strong>Status:</strong> {status}
        </div>
        <div style={{ marginBottom: 4 }}>
          <strong>Model:</strong> {modelName}
        </div>
        <div>
          <strong>Animation:</strong> {animationName}
        </div>
      </div>
    </div>
  );
}
