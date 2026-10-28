'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useJourneyFrame } from './JourneyShell';
import { HUD_H, HUD_W, HudPanels, updateHud } from './JourneyHud';
import { SKY_BOT, SKY_TOP, TOTAL, lerp, mix, nightAt, smooth, travelAt } from './journey-shared';

/**
 * Version 3D de la route (three.js, sans aucun fichier : tout est dessiné par le code). Un véhicule TamCar roule dans
 * une ville low-poly ; la caméra tourne autour de lui d'un chapitre à l'autre ; le jour tombe, les lampadaires,
 * les fenêtres et les phares s'allument. Les panneaux d'information du chapitre se superposent à la scène.
 * Ne dessine que pendant que la page défile (aucun coût au repos). `onFail` : WebGL absent, erreur ou appareil
 * trop lent → le parent bascule sur la version 2D.
 */

const K = 0.06; // mètres par unité de distance du trajet
const END_X = TOTAL * 0.95 * K; // position d'arrivée du véhicule (m)
const X0 = -45;
const X1 = END_X + 90;
const CAR_Z = 1.7; // voie de droite (le véhicule roule vers +x, la caméra est du côté +z)
const FOV = 42;
const FPS_MIN = 22; // en dessous (pendant le défilement), on bascule sur la 2D

type Key = { p: number; pos: [number, number, number]; look: [number, number, number] };
/** Plans de caméra : décalage en x par rapport au véhicule, hauteur, z absolu. */
const KEYS: Key[] = [
  { p: 0.0, pos: [-8.5, 2.8, 9.5], look: [2.2, 0.9, 1.7] },
  { p: 0.12, pos: [-2.0, 2.4, 10.2], look: [1.4, 1.0, 1.7] },
  { p: 0.28, pos: [3.2, 1.7, 6.8], look: [2.0, 1.0, 1.5] },
  { p: 0.44, pos: [0.8, 2.9, 11.0], look: [2.4, 0.9, 1.7] },
  { p: 0.6, pos: [-6.4, 2.0, 8.2], look: [3.4, 0.9, 1.7] },
  { p: 0.755, pos: [4.0, 3.2, 9.6], look: [0.6, 0.9, 1.7] },
  { p: 0.93, pos: [-6.0, 1.9, 9.6], look: [8.5, 0.6, -0.3] },
  { p: 1.0, pos: [-6.0, 1.9, 9.6], look: [8.5, 0.6, -0.3] },
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function camAt(p: number) {
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smooth((p - a.p) / (b.p - a.p));
  return {
    pos: a.pos.map((v, n) => lerp(v, b.pos[n], t)) as [number, number, number],
    look: a.look.map((v, n) => lerp(v, b.look[n], t)) as [number, number, number],
  };
}

type Disposable = { dispose: () => void };

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default function JourneyScene3D({ onFail }: { onFail: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<SVGSVGElement>(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const drawRef = useRef<((p: number) => void) | null>(null);
  const lastP = useRef(0);
  const perf = useRef({ last: 0, frames: 0, acc: 0, slow: 0 });

  useJourneyFrame((p) => {
    lastP.current = p;
    // Fluidité : pendant le défilement, deux séries de 50 images sous FPS_MIN → repli sur la 2D
    const now = performance.now();
    const f = perf.current;
    if (f.last && now - f.last < 90) {
      f.frames++;
      f.acc += now - f.last;
      if (f.frames >= 50) {
        const fps = 1000 / (f.acc / f.frames);
        f.slow = fps < FPS_MIN ? f.slow + 1 : 0;
        f.frames = 0;
        f.acc = 0;
        if (f.slow >= 2) {
          failRef.current();
          return;
        }
      }
    }
    f.last = now;
    drawRef.current?.(p);
  });

  useEffect(() => {
    const host = hostRef.current;
    const bg = bgRef.current;
    const hud = hudRef.current;
    if (!host || !bg || !hud) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 2, alpha: true, powerPreference: 'high-performance' });
    } catch {
      failRef.current();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    host.appendChild(renderer.domElement);

    const disposables: Disposable[] = [];
    const track = <T extends Disposable>(o: T): T => {
      disposables.push(o);
      return o;
    };

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#EAF4FF', 60, 300);
    const camera = new THREE.PerspectiveCamera(FOV, 2, 0.1, 700);
    scene.add(camera);
    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

    /* ------------------------------------------------------------------ lumières */
    const hemi = new THREE.HemisphereLight('#BFDBFF', '#8A9BB5', 1.15);
    scene.add(hemi);
    const sunLight = new THREE.DirectionalLight('#FFF1D6', 1.7);
    scene.add(sunLight, sunLight.target);

    /* ------------------------------------------------------------------ sol, route, trottoirs */
    const groundMat = track(new THREE.MeshLambertMaterial({ color: '#8E9BB0' }));
    const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(1800, 600)), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(END_X / 2, -0.02, -150);
    scene.add(ground);

    const roadMat = track(new THREE.MeshLambertMaterial({ color: '#475569' }));
    const road = new THREE.Mesh(track(new THREE.PlaneGeometry(X1 - X0, 7)), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set((X0 + X1) / 2, 0, 0);
    scene.add(road);

    const curbMat = track(new THREE.MeshLambertMaterial({ color: '#CBD5E1' }));
    const curbGeo = track(new THREE.BoxGeometry(X1 - X0, 0.16, 1.7));
    [-4.35, 4.35].forEach((z) => {
      const m = new THREE.Mesh(curbGeo, curbMat);
      m.position.set((X0 + X1) / 2, 0.08, z);
      scene.add(m);
    });

    // Tirets du milieu de la chaussée
    const dashCount = Math.floor((X1 - X0) / 6);
    const dashMat = track(new THREE.MeshBasicMaterial({ color: '#FACC15' }));
    const dashes = new THREE.InstancedMesh(track(new THREE.BoxGeometry(2.6, 0.02, 0.16)), dashMat, dashCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < dashCount; i++) {
      dummy.position.set(X0 + i * 6 + 1.3, 0.02, 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    }
    scene.add(dashes);

    /* ------------------------------------------------------------------ immeubles (un seul objet fusionné) */
    const S = 256;
    const N = 4;
    const wallTex = track(
      canvasTexture(S, S, (g) => {
        g.fillStyle = '#D9E1EE';
        g.fillRect(0, 0, S, S);
        const c = S / N;
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            g.fillStyle = '#3F5F8C';
            g.fillRect(i * c + c * 0.22, j * c + c * 0.2, c * 0.56, c * 0.6);
            g.fillStyle = '#6D8DBA';
            g.fillRect(i * c + c * 0.22, j * c + c * 0.2, c * 0.56, c * 0.18);
          }
        }
      }),
    );
    const litRnd = rng(7);
    const litTex = track(
      canvasTexture(S, S, (g) => {
        g.fillStyle = '#000';
        g.fillRect(0, 0, S, S);
        const c = S / N;
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            if (litRnd() < 0.5) {
              g.fillStyle = '#FFD27A';
              g.fillRect(i * c + c * 0.22, j * c + c * 0.2, c * 0.56, c * 0.6);
            }
          }
        }
      }),
    );
    [wallTex, litTex].forEach((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = maxAniso;
    });

    const bRnd = rng(21);
    const parts: THREE.BufferGeometry[] = [];
    const TILEM = 12; // mètres par répétition de la texture de façade
    const addRow = (frontZ: number, hMin: number, hMax: number, dMin: number, dMax: number) => {
      let x = X0 - 12;
      while (x < X1 + 20) {
        const w = 8 + bRnd() * 9;
        const h = hMin + bRnd() * (hMax - hMin);
        const d = dMin + bRnd() * (dMax - dMin);
        const g = new THREE.BoxGeometry(w, h, d);
        g.translate(x + w / 2, h / 2, frontZ - d / 2);
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        const ou = bRnd();
        const ov = bRnd();
        for (let f = 0; f < 6; f++) {
          for (let v = 0; v < 4; v++) {
            const i = f * 4 + v;
            if (f === 2 || f === 3) {
              uv.setXY(i, 0.02, 0.98); // toit et dessous : mur uni
            } else {
              const su = (f < 2 ? d : w) / TILEM;
              uv.setXY(i, ou + uv.getX(i) * su, ov + uv.getY(i) * (h / TILEM));
            }
          }
        }
        const tint = 0.8 + bRnd() * 0.2;
        const col = new Float32Array(24 * 3);
        for (let i = 0; i < 24; i++) col.set([tint * (0.96 + bRnd() * 0.06), tint, Math.min(1, tint * (1 + bRnd() * 0.08))], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(g);
        x += w + 2 + bRnd() * 9;
      }
    };
    addRow(-11, 6, 16, 10, 16);
    addRow(-30, 14, 40, 12, 18);
    const cityGeo = track(mergeGeometries(parts)!);
    parts.forEach((g) => g.dispose());
    const cityMat = track(
      new THREE.MeshLambertMaterial({ map: wallTex, emissiveMap: litTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, vertexColors: true }),
    );
    scene.add(new THREE.Mesh(cityGeo, cityMat));

    /* ------------------------------------------------------------------ lampadaires */
    const lamps: { x: number; z: number; dir: number }[] = [];
    for (let x = X0; x < X1; x += 36) lamps.push({ x, z: -4.9, dir: 1 });
    for (let x = X0 + 18; x < X1; x += 72) lamps.push({ x, z: 4.9, dir: -1 });
    const poleMat = track(new THREE.MeshLambertMaterial({ color: '#64748B' }));
    const poles = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.07, 0.1, 6.4, 8)), poleMat, lamps.length);
    const arms = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.08, 0.08, 1.8)), poleMat, lamps.length);
    const headMat = track(new THREE.MeshBasicMaterial({ color: '#94A3B8' }));
    const heads = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.34, 0.12, 0.5)), headMat, lamps.length);
    const haloMat = track(new THREE.MeshBasicMaterial({ color: '#FDE68A', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const halos = new THREE.InstancedMesh(track(new THREE.SphereGeometry(0.7, 12, 8)), haloMat, lamps.length);
    const poolTex = track(
      canvasTexture(
        128,
        128,
        (g) => {
          const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
          r.addColorStop(0, 'rgba(255,226,150,0.9)');
          r.addColorStop(1, 'rgba(255,226,150,0)');
          g.fillStyle = r;
          g.fillRect(0, 0, 128, 128);
        },
        true,
      ),
    );
    const poolMat = track(new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const pools = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(9, 9)), poolMat, lamps.length);
    lamps.forEach((l, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(l.x, 3.2, l.z);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x, 6.4, l.z + l.dir * 0.9);
      dummy.updateMatrix();
      arms.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x, 6.34, l.z + l.dir * 1.7);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x, 6.2, l.z + l.dir * 1.7);
      dummy.updateMatrix();
      halos.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x, 0.05, l.z + l.dir * 1.7 - l.dir * 1.2);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      pools.setMatrixAt(i, dummy.matrix);
    });
    dummy.rotation.set(0, 0, 0);
    scene.add(poles, arms, heads, halos, pools);

    /* ------------------------------------------------------------------ panneaux Cotonou / Porto-Novo */
    const addSign = (text: string, bgColor: string, x: number) => {
      const tex = track(
        canvasTexture(512, 128, (g) => {
          g.fillStyle = bgColor;
          g.fillRect(0, 0, 512, 128);
          g.strokeStyle = '#fff';
          g.lineWidth = 8;
          g.strokeRect(8, 8, 496, 112);
          g.fillStyle = '#fff';
          g.font = '800 62px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(text, 256, 68);
        }),
      );
      const face = track(new THREE.MeshBasicMaterial({ map: tex, color: '#ffffff' }));
      const plate = new THREE.Mesh(track(new THREE.PlaneGeometry(7.2, 1.8)), face);
      plate.position.set(x, 3.7, -4.6);
      const back = new THREE.Mesh(track(new THREE.BoxGeometry(7.4, 2, 0.1)), poleMat);
      back.position.set(x, 3.7, -4.68);
      [-2.8, 2.8].forEach((dx) => {
        const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 8)), poleMat);
        post.position.set(x + dx, 1.5, -4.7);
        scene.add(post);
      });
      scene.add(back, plate);
      return face;
    };
    const signFaces = [addSign('Cotonou', '#1D4ED8', 13), addSign('Porto-Novo', '#15803D', END_X + 16)];

    /* ------------------------------------------------------------------ le véhicule TamCar */
    const car = new THREE.Group();
    const bodyMat = track(new THREE.MeshStandardMaterial({ color: '#2563EB', roughness: 0.38, metalness: 0.25 }));
    const glassMat = track(new THREE.MeshStandardMaterial({ color: '#8FB4E6', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.72 }));
    const shape = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const lowerGeo = track(
      new THREE.ExtrudeGeometry(
        shape([
          [-2.08, 0.3],
          [-2.08, 0.7],
          [-1.78, 0.82],
          [-0.8, 0.86],
          [0.75, 0.86],
          [1.85, 0.8],
          [2.08, 0.6],
          [2.08, 0.3],
        ]),
        { depth: 1.6, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 3, curveSegments: 6 },
      ),
    );
    lowerGeo.translate(0, 0, -0.8);
    car.add(new THREE.Mesh(lowerGeo, bodyMat));
    const cabinGeo = track(
      new THREE.ExtrudeGeometry(
        shape([
          [-1.15, 0.84],
          [-0.6, 1.38],
          [0.9, 1.38],
          [1.45, 0.84],
        ]),
        { depth: 1.46, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 },
      ),
    );
    cabinGeo.translate(0, 0, -0.73);
    car.add(new THREE.Mesh(cabinGeo, glassMat));
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(1.56, 0.06, 1.5)), bodyMat);
    roof.position.set(0.15, 1.4, 0);
    car.add(roof);
    const pillar = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.52, 1.5)), bodyMat);
    pillar.position.set(0.15, 1.12, 0);
    car.add(pillar);
    // Montants de pare-brise et de custode, aux angles de l'habitacle
    const aGeo = track(new THREE.BoxGeometry(0.07, 0.77, 0.07));
    [0.72, -0.72].forEach((z) => {
      const a = new THREE.Mesh(aGeo, bodyMat);
      a.position.set(1.175, 1.11, z);
      a.rotation.z = 0.78;
      const c = new THREE.Mesh(aGeo, bodyMat);
      c.position.set(-0.875, 1.11, z);
      c.rotation.z = -0.78;
      car.add(a, c);
    });
    // Le conducteur, visible par les vitres (conduite à gauche : côté -z)
    const darkMat = track(new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.8 }));
    const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.14, 14, 10)), darkMat);
    head.position.set(0.78, 1.18, -0.38);
    const torso = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.17, 0.26, 4, 10)), darkMat);
    torso.position.set(0.74, 0.92, -0.38);
    car.add(head, torso);

    // Roues : pneu, jante, rayons ; un disque noir derrière chaque roue figure le passage de roue
    const tireMat = track(new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.9 }));
    const rimMat = track(new THREE.MeshStandardMaterial({ color: '#CBD5E1', roughness: 0.3, metalness: 0.7 }));
    const spokeMat = track(new THREE.MeshStandardMaterial({ color: '#64748B', roughness: 0.4, metalness: 0.6 }));
    const tireGeo = track(new THREE.CylinderGeometry(0.33, 0.33, 0.26, 28).rotateX(Math.PI / 2));
    const rimGeo = track(new THREE.CylinderGeometry(0.2, 0.2, 0.27, 20).rotateX(Math.PI / 2));
    const spokeParts = [0, 1, 2, 3, 4].map((i) => new THREE.BoxGeometry(0.05, 0.38, 0.28).rotateZ((i * Math.PI * 2) / 5));
    const spokeGeo = track(mergeGeometries(spokeParts)!);
    spokeParts.forEach((g) => g.dispose());
    const archMat = track(new THREE.MeshBasicMaterial({ color: '#05070D', side: THREE.DoubleSide }));
    const archGeo = track(new THREE.CircleGeometry(0.42, 24));
    const wheels: THREE.Group[] = [];
    [
      [1.35, 0.8],
      [1.35, -0.8],
      [-1.35, 0.8],
      [-1.35, -0.8],
    ].forEach(([x, z]) => {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(tireGeo, tireMat), new THREE.Mesh(rimGeo, rimMat), new THREE.Mesh(spokeGeo, spokeMat));
      w.position.set(x, 0.33, z);
      car.add(w);
      wheels.push(w);
      const arch = new THREE.Mesh(archGeo, archMat);
      arch.position.set(x, 0.36, z > 0 ? 0.878 : -0.878);
      car.add(arch);
    });

    // « TamCar » sur les portières
    const doorTex = track(
      canvasTexture(256, 64, (g) => {
        g.fillStyle = '#2563EB';
        g.fillRect(0, 0, 256, 64);
        g.fillStyle = '#fff';
        g.font = '800 40px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TamCar', 128, 34);
      }),
    );
    const doorMat = track(new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.38, metalness: 0.2 }));
    const doorGeo = track(new THREE.PlaneGeometry(1.1, 0.28));
    [0.88, -0.88].forEach((z) => {
      const d = new THREE.Mesh(doorGeo, doorMat);
      d.position.set(0.1, 0.58, z);
      if (z < 0) d.rotation.y = Math.PI;
      car.add(d);
    });

    // Phares, feux arrière, faisceaux
    const spots: THREE.SpotLight[] = [];
    const headLampMat = track(new THREE.MeshStandardMaterial({ color: '#FEF9C3', emissive: new THREE.Color('#FEF9C3'), emissiveIntensity: 0.3 }));
    const tailMat = track(new THREE.MeshStandardMaterial({ color: '#EF4444', emissive: new THREE.Color('#EF4444'), emissiveIntensity: 0.4 }));
    const lampGeo = track(new THREE.BoxGeometry(0.06, 0.14, 0.34));
    [0.55, -0.55].forEach((z) => {
      const h = new THREE.Mesh(lampGeo, headLampMat);
      h.position.set(2.14, 0.66, z);
      const t = new THREE.Mesh(lampGeo, tailMat);
      t.position.set(-2.14, 0.66, z);
      car.add(h, t);
      const spot = new THREE.SpotLight('#FFF3C4', 0, 45, 0.5, 0.6, 1.4);
      spot.position.set(2.1, 0.7, z);
      spot.target.position.set(16, 0.2, z * 0.6);
      car.add(spot, spot.target);
      spots.push(spot);
    });
    const beamAlpha = track(
      canvasTexture(
        4,
        128,
        (g) => {
          const r = g.createLinearGradient(0, 0, 0, 128);
          r.addColorStop(0, '#fff');
          r.addColorStop(1, '#000');
          g.fillStyle = r;
          g.fillRect(0, 0, 4, 128);
        },
        false,
      ),
    );
    const beamMat = track(
      new THREE.MeshBasicMaterial({ color: '#FEF9C3', transparent: true, opacity: 0, alphaMap: beamAlpha, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    const beamGeo = track(new THREE.ConeGeometry(2.4, 12, 28, 1, true).rotateZ(Math.PI / 2).translate(6, 0, 0));
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(2.12, 0.66, 0);
    beam.rotation.z = -0.03;
    car.add(beam);

    // Ombre portée (disque doux sous le véhicule)
    const shadowTex = track(
      canvasTexture(
        128,
        64,
        (g) => {
          const r = g.createRadialGradient(64, 32, 4, 64, 32, 62);
          r.addColorStop(0, 'rgba(0,0,0,0.55)');
          r.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = r;
          g.fillRect(0, 0, 128, 64);
        },
        false,
      ),
    );
    const shadow = new THREE.Mesh(
      track(new THREE.PlaneGeometry(5.6, 2.6)),
      track(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.03, 0);
    car.add(shadow);
    scene.add(car);

    /* ------------------------------------------------------------------ ciel : astres et étoiles fixés à la caméra */
    const sky = new THREE.Group();
    camera.add(sky);
    const sunMat = track(new THREE.MeshBasicMaterial({ color: '#FDE68A', transparent: true, fog: false }));
    const sunHaloMat = track(new THREE.MeshBasicMaterial({ color: '#FEF3C7', transparent: true, opacity: 0.35, fog: false }));
    const sun = new THREE.Mesh(track(new THREE.SphereGeometry(3.4, 20, 14)), sunMat);
    const sunHalo = new THREE.Mesh(track(new THREE.SphereGeometry(5.6, 20, 14)), sunHaloMat);
    sun.add(sunHalo);
    const moonMat = track(new THREE.MeshBasicMaterial({ color: '#F1F5F9', transparent: true, fog: false }));
    const moon = new THREE.Mesh(track(new THREE.SphereGeometry(3, 20, 14)), moonMat);
    const starRnd = rng(5);
    const starPos = new Float32Array(260 * 3);
    const starMat = track(new THREE.PointsMaterial({ color: '#ffffff', size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    const starGeo = track(new THREE.BufferGeometry());
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, starMat);
    sky.add(sun, moon, stars);

    /* ------------------------------------------------------------------ taille, dessin */
    const sizes = { w: 1, h: 1, aspect: 2, halfH: 1, halfW: 2 };
    const layout = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      sizes.w = w;
      sizes.h = h;
      sizes.aspect = w / h;
      camera.aspect = sizes.aspect;
      camera.updateProjectionMatrix();
      const dz = 95;
      sizes.halfH = dz * Math.tan((FOV / 2) * (Math.PI / 180));
      sizes.halfW = sizes.halfH * sizes.aspect;
      sky.position.set(0, 0, -dz);
      for (let i = 0; i < 260; i++) starPos.set([(starRnd() * 2 - 1) * sizes.halfW, (starRnd() * 1.2 - 0.2) * sizes.halfH, 0], i * 3);
      starGeo.attributes.position.needsUpdate = true;
      hud.style.width = `${Math.min(HUD_W, Math.max(240, w * 0.92))}px`;
    };

    const horizon = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const draw = (p: number) => {
      const night = nightAt(p);
      const xc = TOTAL * travelAt(p) * K;
      const bob = Math.sin((xc / 0.33) * 1.1) * (p < 0.995 ? 0.012 : 0);
      car.position.set(xc, bob, CAR_Z);
      wheels.forEach((w) => (w.rotation.z = -xc / 0.33));

      // Lumières et couleurs du jour → nuit
      hemi.color.set(mix('#BFDBFF', '#26346B', night));
      hemi.groundColor.set(mix('#8A9BB5', '#0A0F24', night));
      hemi.intensity = lerp(1.15, 0.85, night);
      sunLight.color.set(mix('#FFF1D6', '#7C93D6', night));
      sunLight.intensity = lerp(1.7, 0.4, night);
      sunLight.position.set(xc + 30, 50, 40);
      sunLight.target.position.set(xc, 0, 0);
      const skyBot = mix(SKY_BOT[0], SKY_BOT[1], night);
      const skyTop = mix(SKY_TOP[0], SKY_TOP[1], night);
      (scene.fog as THREE.Fog).color.set(skyBot);
      groundMat.color.set(mix('#8E9BB0', '#101A33', night));
      roadMat.color.set(mix('#475569', '#1B2433', night));
      curbMat.color.set(mix('#CBD5E1', '#2B3A52', night));
      cityMat.emissiveIntensity = night * 1.25;
      headMat.color.set(mix('#94A3B8', '#FDE68A', night));
      haloMat.opacity = night * 0.4;
      poolMat.opacity = night * 0.6;
      headLampMat.emissiveIntensity = 0.3 + night * 3;
      tailMat.emissiveIntensity = 0.4 + night * 1.2;
      beamMat.opacity = night * 0.5;
      spots.forEach((s) => (s.intensity = night * 150));
      signFaces.forEach((m) => m.color.set(mix('#FFFFFF', '#9AA6BC', night)));
      bodyMat.color.set(mix('#2563EB', '#3B7BFF', night));
      bodyMat.emissive.set('#1B3FA0');
      bodyMat.emissiveIntensity = night * 0.35;
      glassMat.color.set(mix('#8FB4E6', '#2A4380', night));
      starMat.opacity = night * 0.9;

      // Caméra : plan du chapitre, décalé par rapport au véhicule (plus loin sur un écran étroit)
      const c = camAt(p);
      const zoom = 1 + Math.max(0, Math.min(0.9, (1.15 - sizes.aspect) * 1.1));
      // Écran étroit : on vise le véhicule lui-même (sinon il sort du cadre à gauche)
      const k = Math.max(0.2, Math.min(1, sizes.aspect / 1.3));
      const look = new THREE.Vector3(xc + c.look[0] * k, c.look[1], c.look[2]);
      const pos = new THREE.Vector3(xc + c.pos[0] * (0.4 + 0.6 * k), c.pos[1], c.pos[2]);
      pos.sub(look).multiplyScalar(zoom).add(look);
      camera.position.copy(pos);
      camera.lookAt(look);
      camera.updateMatrixWorld();

      // Astres : le soleil se couche, la lune se lève
      sun.position.set(sizes.halfW * 0.72, lerp(sizes.halfH * 0.55, -sizes.halfH * 0.25, night), 0);
      moon.position.set(sizes.halfW * 0.72, lerp(-sizes.halfH * 0.3, sizes.halfH * 0.55, night), 0);
      sunMat.opacity = 1 - night;
      sunHaloMat.opacity = 0.35 * (1 - night);
      moonMat.opacity = night;

      // Le ciel (dégradé CSS derrière le canvas transparent) s'aligne sur la ligne d'horizon
      camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      horizon.copy(camera.position).addScaledVector(dir, 2000).project(camera);
      const yH = Math.min(96, Math.max(4, ((1 - horizon.y) / 2) * 100));
      bg.style.background = `linear-gradient(to bottom, ${skyTop} 0%, ${skyBot} ${yH}%, ${skyBot} 100%)`;

      updateHud(hud, p);
      renderer.render(scene, camera);
    };

    layout();
    drawRef.current = draw;
    draw(lastP.current);
    const ro = new ResizeObserver(() => {
      layout();
      draw(lastP.current);
    });
    ro.observe(host);

    return () => {
      drawRef.current = null;
      ro.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0" aria-hidden="true">
      <div ref={bgRef} className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${SKY_TOP[0]}, ${SKY_BOT[0]})` }} />
      <div ref={hostRef} className="absolute inset-0" />
      <svg ref={hudRef} className="absolute left-1/2 top-[3%] -translate-x-1/2 font-sans" viewBox={`0 0 ${HUD_W} ${HUD_H + 20}`} style={{ width: HUD_W }} focusable="false">
        <HudPanels />
      </svg>
    </div>
  );
}

