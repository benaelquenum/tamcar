'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * APERÇU 3D de la scène du volant : vrai volant modélisé (jante, branches, moyeu), route en perspective réelle
 * qui s'incurve, palmiers et collines en volume, brume atmosphérique, lumière du soleil. Même cycle que la
 * version 2D (12 s : droite, tout droit, gauche) : le volant tourne, la route s'incurve du même côté et le
 * lointain (collines, ville, soleil) glisse en sens inverse. Le canvas est transparent : le fond bleu de la
 * section reste le ciel. À placer dans un parent `relative overflow-hidden`.
 */

const CYCLE = 12; // s, durée d'un cycle de direction
const SPEED = 16; // m/s, vitesse apparente
const ROAD_HALF = 2.8; // demi-largeur de la route (m)
const SEG = 3; // longueur d'un segment de route (m)
const SEGMENTS = 96; // jusqu'à ~290 m devant
const TEX_LEN = 12; // longueur d'une répétition de la texture de route (m)
const K_MAX = 0.0006; // courbure maximale de la route
const YAW_MAX = 0.18; // rad : glissement du lointain
const WHEEL_ANGLE = (62 * Math.PI) / 180;
const FOG_COLOR = '#2a57d4';

const KEYS: Array<[number, number]> = [
  [0, 0],
  [0.2, 1],
  [0.36, 1],
  [0.5, 0],
  [0.7, -1],
  [0.86, -1],
  [1, 0],
];

/** Direction normalisée (-1 gauche … 1 droite) à l'instant t, avec adoucissement entre les repères. */
function steerAt(t: number): number {
  const u = (t % CYCLE) / CYCLE;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [u0, v0] = KEYS[i];
    const [u1, v1] = KEYS[i + 1];
    if (u >= u0 && u <= u1) {
      const x = (u - u0) / (u1 - u0);
      const e = x * x * (3 - 2 * x);
      return v0 + (v1 - v0) * e;
    }
  }
  return 0;
}

function roadTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0e2468';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, Math.random() * 512, 2, 2);
  }
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.fillRect(14, 0, 9, 512);
  g.fillRect(233, 0, 9, 512);
  g.fillStyle = '#fde047';
  g.fillRect(123, 0, 10, 205);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, maxAniso);
  return t;
}

function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function SteeringScene3D({ className = '' }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      return; // pas de WebGL : le fond bleu seul reste affiché
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    host.appendChild(renderer.domElement);

    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(o: T): T => {
      disposables.push(o);
      return o;
    };

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(FOG_COLOR, 40, 330);

    const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 800);
    camera.position.set(0, 1.3, 0);
    camera.rotation.x = -0.05;
    scene.add(camera);

    /* ------------------------------------------------------------------ lumières */
    scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x0a1846, 1.0));
    const sun = new THREE.DirectionalLight(0xdbe8ff, 1.1);
    sun.position.set(70, 90, -80);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 1.0);
    fill.position.set(-20, 30, 50);
    scene.add(fill);
    const glint = new THREE.PointLight(0xa5d4ff, 2.4, 7);
    glint.position.set(-0.5, 0.35, -0.35);
    camera.add(glint);

    /* ------------------------------------------------------------------ sol et route */
    const groundMat = track(new THREE.MeshBasicMaterial({ color: '#0b2a80' }));
    const groundGeo = track(new THREE.PlaneGeometry(2400, 2400));
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    scene.add(ground);

    const roadPos = new Float32Array((SEGMENTS + 1) * 2 * 3);
    const roadUv = new Float32Array((SEGMENTS + 1) * 2 * 2);
    const roadNormal = new Float32Array((SEGMENTS + 1) * 2 * 3);
    const roadIdx: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const s = -6 + i * SEG;
      roadUv.set([0, s / TEX_LEN, 1, s / TEX_LEN], i * 4);
      roadNormal.set([0, 1, 0, 0, 1, 0], i * 6);
      if (i < SEGMENTS) {
        const a = i * 2;
        roadIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const roadGeo = track(new THREE.BufferGeometry());
    roadGeo.setAttribute('position', new THREE.BufferAttribute(roadPos, 3));
    roadGeo.setAttribute('uv', new THREE.BufferAttribute(roadUv, 2));
    roadGeo.setAttribute('normal', new THREE.BufferAttribute(roadNormal, 3));
    roadGeo.setIndex(roadIdx);
    const roadTex = track(roadTexture(renderer.capabilities.getMaxAnisotropy()));
    const roadMat = track(new THREE.MeshBasicMaterial({ map: roadTex }));
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.frustumCulled = false;
    scene.add(road);

    /* ------------------------------------------------------------------ palmiers le long de la route */
    const trunkGeo = track(new THREE.CylinderGeometry(0.14, 0.26, 6, 8));
    trunkGeo.translate(0, 3, 0);
    const frondGeo = track(new THREE.SphereGeometry(1, 8, 4));
    frondGeo.scale(0.4, 0.07, 1.55);
    frondGeo.translate(0, 0, 1.55);
    const trunkMat = track(new THREE.MeshStandardMaterial({ color: '#0a1850', roughness: 0.9 }));
    const frondMat = track(new THREE.MeshStandardMaterial({ color: '#1546a8', roughness: 0.7, flatShading: true }));

    type Palm = { g: THREE.Group; s0: number; lateral: number };
    const palms: Palm[] = [];
    const PALMS_PER_SIDE = 12;
    const SPACING = 24;
    const LOOP = PALMS_PER_SIDE * SPACING;
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (const side of [-1, 1]) {
      for (let i = 0; i < PALMS_PER_SIDE; i++) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(trunkGeo, trunkMat));
        const crown = new THREE.Group();
        crown.position.y = 6;
        for (let f = 0; f < 10; f++) {
          const pivot = new THREE.Group();
          pivot.rotation.y = (f / 10) * Math.PI * 2 + rnd() * 0.3;
          const m = new THREE.Mesh(frondGeo, frondMat);
          m.rotation.x = 0.45 + rnd() * 0.45;
          pivot.add(m);
          crown.add(pivot);
        }
        g.add(crown);
        const sc = 0.8 + rnd() * 0.7;
        g.scale.setScalar(sc);
        g.rotation.z = (rnd() - 0.5) * 0.12;
        scene.add(g);
        palms.push({ g, s0: i * SPACING + rnd() * 10 + (side > 0 ? 11 : 0), lateral: side * (ROAD_HALF + 3.5 + rnd() * 9) });
      }
    }

    /* ------------------------------------------------------------------ lointain : collines, ville, soleil, nuages */
    const sky = new THREE.Group();
    scene.add(sky);
    const hillMat = track(new THREE.MeshStandardMaterial({ color: '#0b2468', roughness: 1, flatShading: true }));
    const cityMat = track(new THREE.MeshStandardMaterial({ color: '#0a1d58', roughness: 1, flatShading: true }));
    for (let i = 0; i < 30; i++) {
      const a = ((-82 + i * 5.6 + (rnd() - 0.5) * 3) * Math.PI) / 180;
      const r = 320 + rnd() * 30;
      const h = 18 + rnd() * 30;
      const rad = 42 + rnd() * 30;
      const geo = track(new THREE.ConeGeometry(rad, h, 5));
      const m = new THREE.Mesh(geo, hillMat);
      m.position.set(Math.sin(a) * r, h / 2 - 3, -Math.cos(a) * r);
      m.rotation.y = rnd() * 3;
      sky.add(m);
    }
    for (let i = 0; i < 9; i++) {
      const a = ((14 + i * 2.2) * Math.PI) / 180;
      const r = 300;
      const w = 9 + rnd() * 6;
      const h = 24 + rnd() * 40;
      const geo = track(new THREE.BoxGeometry(w, h, w));
      const m = new THREE.Mesh(geo, cityMat);
      m.position.set(Math.sin(a) * r, h / 2 - 2, -Math.cos(a) * r);
      sky.add(m);
    }
    const sunTex = track(glowTexture('rgba(255,251,224,1)', 'rgba(253,230,138,0.55)'));
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sunSprite.scale.set(150, 150, 1);
    sunSprite.position.set(Math.sin(0.43) * 340, 105, -Math.cos(0.43) * 340);
    sky.add(sunSprite);
    const cloudTex = track(glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.35)'));
    for (const [deg, y, sx] of [[-48, 130, 190], [-14, 150, 150], [6, 118, 170], [38, 140, 200], [-70, 120, 160]] as const) {
      const a = (deg * Math.PI) / 180;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.16, depthWrite: false, fog: false }));
      spr.scale.set(sx, 34, 1);
      spr.position.set(Math.sin(a) * 330, y, -Math.cos(a) * 330);
      sky.add(spr);
    }

    /* ------------------------------------------------------------------ volant */
    const wheelTilt = new THREE.Group();
    wheelTilt.position.set(0, -0.47, -1.15);
    wheelTilt.rotation.x = -0.42;
    camera.add(wheelTilt);
    const wheelRot = new THREE.Group();
    wheelTilt.add(wheelRot);

    const R = 0.35;
    const tube = 0.05;
    const navy = track(new THREE.MeshStandardMaterial({ color: '#2e4396', roughness: 0.34, metalness: 0.25 }));
    const ringGeo = track(new THREE.TorusGeometry(R, tube, 24, 80));
    wheelRot.add(new THREE.Mesh(ringGeo, navy));
    const arc = 0.5;
    const accentGeo = track(new THREE.TorusGeometry(R, tube * 1.1, 16, 24, arc));
    const accentMat = track(new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0ea5e9', emissiveIntensity: 0.55, roughness: 0.35 }));
    const accent = new THREE.Mesh(accentGeo, accentMat);
    accent.rotation.z = Math.PI / 2 - arc / 2;
    wheelRot.add(accent);
    const barGeo = track(new THREE.CapsuleGeometry(0.036, 2 * R - 0.12, 6, 14));
    const bar = new THREE.Mesh(barGeo, navy);
    bar.rotation.z = Math.PI / 2;
    wheelRot.add(bar);
    const downGeo = track(new THREE.CapsuleGeometry(0.036, R - 0.16, 6, 14));
    const down = new THREE.Mesh(downGeo, navy);
    down.position.y = -R / 2;
    wheelRot.add(down);
    const hubGeo = track(new THREE.CylinderGeometry(0.1, 0.125, 0.075, 40));
    const hubMat = track(new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.3, metalness: 0.3 }));
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.x = Math.PI / 2;
    wheelRot.add(hub);
    const capGeo = track(new THREE.CylinderGeometry(0.036, 0.036, 0.085, 28));
    const capMat = track(new THREE.MeshStandardMaterial({ color: '#eab308', emissive: '#ca8a04', emissiveIntensity: 0.5, roughness: 0.3 }));
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.rotation.x = Math.PI / 2;
    wheelRot.add(cap);

    /* ------------------------------------------------------------------ dimensionnement */
    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      // Point de fuite à 72 % de la largeur sur grand écran (texte à gauche), au centre sur téléphone
      const vp = w >= 1024 || new URLSearchParams(window.location.search).has('lg') ? 0.74 : 0.5;
      const full = 2 * vp * w;
      camera.aspect = full / h;
      camera.setViewOffset(full, h, 0, 0, w, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    ro.observe(host);

    /* ------------------------------------------------------------------ image */
    const draw = (t: number) => {
      const steer = steerAt(t);
      const k = steer * K_MAX;
      const travel = SPEED * t;

      // Route : on déplace les sommets le long de la courbe, la texture avance vers nous
      for (let i = 0; i <= SEGMENTS; i++) {
        const s = -6 + i * SEG;
        const xc = k * s * s;
        const z = -s;
        roadPos.set([xc - ROAD_HALF, 0.01, z, xc + ROAD_HALF, 0.01, z], i * 6);
      }
      roadGeo.attributes.position.needsUpdate = true;
      roadTex.offset.y = travel / TEX_LEN;

      // Palmiers : ils viennent vers nous et suivent la courbe
      for (const p of palms) {
        const s = ((((p.s0 - travel) % LOOP) + LOOP) % LOOP) - 8;
        p.g.position.set(k * s * s + p.lateral, 0, -s);
        p.g.visible = p.lateral > 0 ? s > 14 : s > 55;
      }

      // Lointain : glisse en sens inverse du virage (la voiture tourne, le décor se décale)
      sky.rotation.y = steer * YAW_MAX;

      // Volant : horaire quand on tourne à droite
      wheelRot.rotation.z = -steer * WHEEL_ANGLE;

      renderer.render(scene, camera);
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resize();

    // Pour les contrôles visuels : ?t=3 (instant du cycle) fige la direction
    const fixedParam = new URLSearchParams(window.location.search).get('t');
    const fixedT = fixedParam !== null && !Number.isNaN(Number(fixedParam)) ? Number(fixedParam) : null;

    let raf = 0;
    let visible = true;
    let t0 = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;
      if (!visible || document.hidden) return;
      acc += dt;
      draw(fixedT ?? acc);
    };
    if (reduced) {
      draw(0);
    } else {
      raf = requestAnimationFrame(frame);
    }
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
    });
    io.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} aria-hidden className={`pointer-events-none absolute ${className}`} />;
}
