"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Float, Sparkles } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CARD_ASPECT, drawCardBack, drawCardFront, renderToCanvas } from "@/lib/card-art";
import type { Card, Rarity } from "@/lib/mock-cards";

const H = 1.7;
const W = H * CARD_ASPECT;
const RADIUS = 0.07;
const THICKNESS = 0.014;

const HOLO_STRENGTH: Record<Rarity, number> = {
  album: 0.45,
  pob: 0.75,
  luckydraw: 0.85,
  fansign: 1,
};

// 全息箔：彩虹色隨卡片朝向偏移，掠射角越大越明顯；再疊一層閃粉和高光
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uHolo;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;

  vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 base = texture2D(uMap, vUv).rgb;
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    float facing = clamp(dot(n, v), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, 1.5);

    float band = vUv.x * 0.9 + vUv.y * 1.3 + n.x * 2.2 + n.y * 1.6 + uTime * 0.03;
    vec3 rainbow = hsv2rgb(vec3(fract(band), 0.6, 1.0));
    float stripes = 0.7 + 0.3 * sin((vUv.x - vUv.y) * 60.0 + n.x * 12.0);
    float foil = uHolo * (0.12 + 0.75 * fresnel) * stripes;

    vec2 cell = floor(vUv * vec2(90.0, 140.0));
    float twinkle = step(0.985, hash(cell + floor(n.xy * 8.0)));
    float sparkle = twinkle * uHolo * (0.4 + fresnel);

    vec3 l = normalize(vec3(0.4, 0.6, 1.0));
    float spec = pow(max(dot(n, normalize(l + v)), 0.0), 60.0);

    vec3 color = base + rainbow * foil * 0.55 + vec3(sparkle) * 0.8 + vec3(spec) * 0.35;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function roundedRectShape() {
  const s = new THREE.Shape();
  const x = -W / 2;
  const y = -H / 2;
  s.moveTo(x + RADIUS, y);
  s.lineTo(x + W - RADIUS, y);
  s.quadraticCurveTo(x + W, y, x + W, y + RADIUS);
  s.lineTo(x + W, y + H - RADIUS);
  s.quadraticCurveTo(x + W, y + H, x + W - RADIUS, y + H);
  s.lineTo(x + RADIUS, y + H);
  s.quadraticCurveTo(x, y + H, x, y + H - RADIUS);
  s.lineTo(x, y + RADIUS);
  s.quadraticCurveTo(x, y, x + RADIUS, y);
  return s;
}

// ShapeGeometry 的 UV 是頂點座標，要映射回 0..1
function faceGeometry(shape: THREE.Shape) {
  const geo = new THREE.ShapeGeometry(shape, 16);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + W / 2) / W, (pos.getY(i) + H / 2) / H);
  }
  uv.needsUpdate = true;
  return geo;
}

function useCardTexture(card: Card, side: "front" | "back", rarityLabel: string, fontsReady: boolean) {
  const placeholder = useMemo(() => {
    const canvas = renderToCanvas((ctx) =>
      side === "front" ? drawCardFront(ctx, card, rarityLabel) : drawCardBack(ctx, card),
    );
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
    // fontsReady 變化時用載入後的字型重繪
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, side, rarityLabel, fontsReady]);
  useEffect(() => () => placeholder.dispose(), [placeholder]);

  // 有實拍圖時載入成貼圖，載入完成前和失敗時用 canvas 佔位圖
  const src = side === "front" ? card.image?.front : card.image?.back;
  const [photo, setPhoto] = useState<{ src: string; texture: THREE.Texture }>();
  useEffect(() => {
    if (!src) return;
    let texture: THREE.Texture | undefined;
    let cancelled = false;
    new THREE.TextureLoader().load(
      src,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        texture = t;
        if (cancelled) t.dispose();
        else setPhoto({ src, texture: t });
      },
      undefined,
      () => {},
    );
    return () => {
      cancelled = true;
      texture?.dispose();
    };
  }, [src]);

  return photo && photo.src === src ? photo.texture : placeholder;
}

type Rotation = { x: number; y: number; dragging: boolean };

function PhotocardMesh({
  card,
  rarityLabel,
  rotationRef,
  fontsReady,
}: {
  card: Card;
  rarityLabel: string;
  rotationRef: React.RefObject<Rotation>;
  fontsReady: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const shape = useMemo(() => roundedRectShape(), []);
  const face = useMemo(() => faceGeometry(shape), [shape]);
  const edge = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth: THICKNESS, bevelEnabled: false, curveSegments: 16 }),
    [shape],
  );
  const front = useCardTexture(card, "front", rarityLabel, fontsReady);
  const back = useCardTexture(card, "back", rarityLabel, fontsReady);

  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uMap: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uHolo: { value: 0 } }), []);

  useEffect(() => {
    const m = material.current;
    if (!m) return;
    m.uniforms.uMap.value = front;
    m.uniforms.uHolo.value = HOLO_STRENGTH[card.rarity];
  }, [front, card.rarity]);

  useFrame((state, delta) => {
    if (!rotationRef.current.dragging) {
      rotationRef.current.y += delta * 0.45;
      rotationRef.current.x *= 1 - Math.min(delta * 2, 1);
    }
    if (group.current) {
      group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, rotationRef.current.y, 6, delta);
      group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, rotationRef.current.x, 6, delta);
    }
    if (material.current) material.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group ref={group}>
      <mesh geometry={edge} position={[0, 0, -THICKNESS / 2]}>
        <meshStandardMaterial color="#f4f1ff" roughness={0.4} />
      </mesh>
      <mesh geometry={face} position={[0, 0, THICKNESS / 2 + 0.0005]}>
        <shaderMaterial ref={material} vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} toneMapped={false} />
      </mesh>
      <mesh geometry={face} position={[0, 0, -THICKNESS / 2 - 0.0005]} rotation={[0, Math.PI, 0]}>
        <meshStandardMaterial map={back} roughness={0.35} metalness={0.2} />
      </mesh>
    </group>
  );
}

export default function HoloCard3D({ card, rarityLabel }: { card: Card; rarityLabel: string }) {
  const rotationRef = useRef<Rotation>({ x: -0.08, y: -0.4, dragging: false });
  const last = useRef<{ x: number; y: number } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    rotationRef.current.dragging = true;
    last.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!last.current) return;
    const r = rotationRef.current;
    r.y += (e.clientX - last.current.x) * 0.012;
    r.x = THREE.MathUtils.clamp(r.x + (e.clientY - last.current.y) * 0.008, -0.6, 0.6);
    last.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = () => {
    rotationRef.current.dragging = false;
    last.current = null;
  };

  return (
    <div
      className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 3.7], fov: 35 }} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={1.4} />
        <directionalLight position={[2, 3, 4]} intensity={1.6} />
        <pointLight position={[-3, -1, 2]} intensity={6} color={card.palette[0]} />
        <pointLight position={[3, 1, -2]} intensity={6} color={card.palette[2]} />
        <Float speed={1.6} rotationIntensity={0.15} floatIntensity={0.5}>
          <PhotocardMesh card={card} rarityLabel={rarityLabel} rotationRef={rotationRef} fontsReady={fontsReady} />
        </Float>
        <Sparkles count={60} scale={[4, 3, 2]} size={2.2} speed={0.4} color={card.palette[1]} />
        <ContactShadows position={[0, -1.25, 0]} opacity={0.45} scale={4} blur={2.8} far={2} color="#000" />
      </Canvas>
    </div>
  );
}
