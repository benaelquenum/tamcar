'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useJourneyFrame } from './JourneyShell';
import { HUD_H, HUD_W, HudPanels, updateHud } from './JourneyHud';
import { SKY_BOT, SKY_TOP, TOTAL, lerp, mix, nightAt, smooth, travelAt } from './journey-shared';

/**
 * Version 3D de la route (three.js, sans fichier de modèle : tout est dessiné par le code, seul le logo TamCar est
 * un fichier existant). Un Cotonou / Porto-Novo imaginé d'après des photos de référence : maisons basses ocre, toits
 * en tôle, terre rouge, palmiers, kiosques, parasols, zémidjans jaune et bleu, poteaux et fils, brume beige.
 * Une voiture blanche TamCar roule ; la caméra tourne autour d'elle d'un chapitre à l'autre ; le jour tombe
 * (lampadaires orangés, phares, quelques fenêtres allumées). Les panneaux d'information se superposent à la scène.
 * Ne dessine que pendant que la page défile. `onFail` : WebGL absent, erreur ou appareil trop lent → repli en 2D.
 */

const K = 0.06; // mètres par unité de distance du trajet
const END_X = TOTAL * 0.95 * K; // position d'arrivée du véhicule (m)
const X0 = -50;
const X1 = END_X + 100;
const CAR_Z = 1.7; // voie de droite (le véhicule roule vers +x, la caméra est du côté +z)
const FOV = 42;
const FPS_MIN = 22; // en dessous (pendant le défilement), on bascule sur la 2D
const SPAN = X1 - X0 + 260; // longueur sur laquelle la circulation en sens inverse boucle

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

/** Ajoute un attribut `color` uniforme (r, g, b en 0-1) à une géométrie et la rend non indexée (fusion possible). */
function paint(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = ng.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return m;
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    host.appendChild(renderer.domElement);

    const disposables: Disposable[] = [];
    const track = <T extends Disposable>(o: T): T => {
      disposables.push(o);
      return o;
    };
    const cancelled = { v: false };

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#E9D9BF', 26, 175);
    const camera = new THREE.PerspectiveCamera(FOV, 2, 0.1, 700);
    scene.add(camera);
    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const dummy = new THREE.Object3D();

    // Reflets réalistes sur la carrosserie : environnement « studio » généré par le code (aucun fichier)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    const envTarget = pmrem.fromScene(envScene, 0.04);
    scene.environment = envTarget.texture;
    track(envTarget);
    envScene.dispose();
    pmrem.dispose();

    /* ------------------------------------------------------------------ lumières */
    const hemi = new THREE.HemisphereLight('#E8EEF8', '#B58A63', 1.1);
    scene.add(hemi);
    const sunLight = new THREE.DirectionalLight('#FFF0D2', 2.0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    const sc = sunLight.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 26;
    sc.bottom = -26;
    sc.near = 1;
    sc.far = 130;
    sc.updateProjectionMatrix();
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.05;
    scene.add(sunLight, sunLight.target);

    /* ------------------------------------------------------------------ sol (terre rouge), chaussée, trottoirs */
    const earthTex = track(
      canvasTexture(256, 256, (g) => {
        g.fillStyle = '#B7774F';
        g.fillRect(0, 0, 256, 256);
        const r = rng(3);
        for (let i = 0; i < 1600; i++) {
          const v = r();
          g.fillStyle = v < 0.5 ? 'rgba(120,48,24,0.18)' : v < 0.8 ? 'rgba(240,160,100,0.16)' : 'rgba(80,36,20,0.2)';
          g.fillRect(r() * 256, r() * 256, 2 + r() * 5, 2 + r() * 4);
        }
      }),
    );
    earthTex.wrapS = earthTex.wrapT = THREE.RepeatWrapping;
    earthTex.repeat.set(220, 80);
    earthTex.anisotropy = maxAniso;
    const groundMat = track(new THREE.MeshLambertMaterial({ map: earthTex, color: '#ffffff' }));
    const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(1800, 640)), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(END_X / 2, -0.02, -150);
    ground.receiveShadow = true;
    scene.add(ground);

    const asphaltTex = track(
      canvasTexture(128, 128, (g) => {
        g.fillStyle = '#6A6E76';
        g.fillRect(0, 0, 128, 128);
        const r = rng(9);
        for (let i = 0; i < 900; i++) {
          g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
          g.fillRect(r() * 128, r() * 128, 2, 2);
        }
      }),
    );
    asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
    asphaltTex.repeat.set((X1 - X0) / 6, 2);
    const roadMat = track(new THREE.MeshLambertMaterial({ map: asphaltTex, color: '#ffffff' }));
    const road = new THREE.Mesh(track(new THREE.PlaneGeometry(X1 - X0, 7)), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set((X0 + X1) / 2, 0, 0);
    road.receiveShadow = true;
    scene.add(road);

    // Bordures peintes en noir et blanc, comme sur les carrefours
    const curbTex = track(
      canvasTexture(64, 16, (g) => {
        g.fillStyle = '#E4E4E0';
        g.fillRect(0, 0, 64, 16);
        g.fillStyle = '#2A2D33';
        g.fillRect(32, 0, 32, 16);
      }),
    );
    curbTex.wrapS = THREE.RepeatWrapping;
    curbTex.repeat.set((X1 - X0) / 1.6, 1);
    const curbMat = track(new THREE.MeshLambertMaterial({ map: curbTex, color: '#ffffff' }));
    const curbGeo = track(new THREE.BoxGeometry(X1 - X0, 0.18, 0.5));
    [-3.75, 3.75].forEach((z) => {
      const m = new THREE.Mesh(curbGeo, curbMat);
      m.position.set((X0 + X1) / 2, 0.09, z);
      m.receiveShadow = true;
      scene.add(m);
    });

    // Marquage blanc : tirets au milieu, lignes continues sur les bords
    const lineMat = track(new THREE.MeshBasicMaterial({ color: '#EDEDED' }));
    const dashCount = Math.floor((X1 - X0) / 9);
    const dashes = new THREE.InstancedMesh(track(new THREE.BoxGeometry(3.2, 0.02, 0.15)), lineMat, dashCount);
    for (let i = 0; i < dashCount; i++) {
      dummy.position.set(X0 + i * 9 + 1.6, 0.02, 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    }
    scene.add(dashes);
    const edgeGeo = track(new THREE.BoxGeometry(X1 - X0, 0.02, 0.12));
    [-3.2, 3.2].forEach((z) => {
      const e = new THREE.Mesh(edgeGeo, lineMat);
      e.position.set((X0 + X1) / 2, 0.02, z);
      scene.add(e);
    });

    /* ------------------------------------------------------------------ maisons basses (un seul objet par matière) */
    const TU = 12; // mètres de façade par répétition de la texture
    const TV = 6.8;
    const wallTex = track(
      canvasTexture(512, 288, (g) => {
        g.fillStyle = '#F2EADB';
        g.fillRect(0, 0, 512, 288);
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 4; col++) {
            const x = col * 128 + 38;
            const y = row * 144 + 34;
            g.fillStyle = '#C9B79C';
            g.fillRect(x - 4, y - 4, 60, 80);
            g.fillStyle = '#2C3848';
            g.fillRect(x, y, 52, 72);
            g.fillStyle = '#4A5F7C';
            g.fillRect(x, y, 52, 20);
          }
          g.fillStyle = '#CDBBA2';
          g.fillRect(0, row * 144 + 136, 512, 8);
        }
      }),
    );
    const litRnd = rng(13);
    const litTex = track(
      canvasTexture(512, 288, (g) => {
        g.fillStyle = '#000';
        g.fillRect(0, 0, 512, 288);
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 4; col++) {
            if (litRnd() < 0.2) {
              g.fillStyle = '#FFC878';
              g.fillRect(col * 128 + 38, row * 144 + 34, 52, 72);
            }
          }
        }
      }),
    );
    [wallTex, litTex].forEach((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = maxAniso;
    });

    const signWords: [string, string][] = [
      ['BOUTIQUE', '#1E4FA8'],
      ['PHARMACIE', '#15803D'],
      ['ALIMENTATION', '#B91C1C'],
      ['COUTURE', '#7C3AED'],
      ['RESTAURANT', '#C2410C'],
      ['COIFFURE', '#0E7490'],
      ['QUINCAILLERIE', '#374151'],
      ['CYBER CAFÉ', '#A16207'],
    ];
    const signAtlas = track(
      canvasTexture(1024, 512, (g) => {
        signWords.forEach(([word, color], i) => {
          const x = (i % 2) * 512;
          const y = Math.floor(i / 2) * 128;
          g.fillStyle = color;
          g.fillRect(x, y, 512, 128);
          g.strokeStyle = 'rgba(255,255,255,0.85)';
          g.lineWidth = 6;
          g.strokeRect(x + 6, y + 6, 500, 116);
          g.fillStyle = '#fff';
          g.font = '800 56px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(word, x + 256, y + 68);
        });
      }),
    );

    const bRnd = rng(21);
    const wallParts: THREE.BufferGeometry[] = [];
    const roofParts: THREE.BufferGeometry[] = [];
    const awningParts: THREE.BufferGeometry[] = [];
    const signParts: THREE.BufferGeometry[] = [];
    const SAND = ['#EFE0C4', '#E5CDA6', '#F2E6D0', '#DDBF94', '#EBD3AE', '#D9C3A0'];
    const RUST = ['#8B4A2B', '#7A3F25', '#A25A35', '#6F3A22', '#94502E'];
    const AWN = ['#D94B3D', '#2E6FD8', '#F2B705', '#2FA84F', '#E8702A'];

    const wallBox = (x: number, w: number, h: number, d: number, frontZ: number, tint: string) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x + w / 2, h / 2, frontZ - d / 2);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const ou = Math.floor(bRnd() * 4) / 4;
      const ov = Math.floor(bRnd() * 2) / 2;
      for (let f = 0; f < 6; f++) {
        for (let v = 0; v < 4; v++) {
          const i = f * 4 + v;
          if (f === 2 || f === 3) uv.setXY(i, 0.01, 0.99);
          else uv.setXY(i, ou + uv.getX(i) * ((f < 2 ? d : w) / TU), ov + uv.getY(i) * (h / TV));
        }
      }
      wallParts.push(paint(g, tint));
    };
    const gable = (cx: number, w: number, d: number, wallH: number, roofH: number, frontZ: number) => {
      const ov = 0.5;
      const tri = new THREE.Shape([new THREE.Vector2(-d / 2 - ov, 0), new THREE.Vector2(0, roofH), new THREE.Vector2(d / 2 + ov, 0)]);
      const g = new THREE.ExtrudeGeometry(tri, { depth: w + 2 * ov, bevelEnabled: false });
      g.translate(0, 0, -(w + 2 * ov) / 2);
      g.rotateY(Math.PI / 2);
      g.translate(cx, wallH, frontZ - d / 2);
      roofParts.push(paint(g, RUST[Math.floor(bRnd() * RUST.length)]));
    };
    const flatRoof = (cx: number, w: number, d: number, wallH: number, frontZ: number) => {
      const g = new THREE.BoxGeometry(w + 0.4, 0.22, d + 0.4);
      g.translate(cx, wallH + 0.11, frontZ - d / 2);
      roofParts.push(paint(g, '#B9AE9B'));
    };
    const shopFront = (x: number, w: number, frontZ: number) => {
      const aw = new THREE.BoxGeometry(w * 0.86, 0.07, 1.4);
      aw.rotateX(0.18);
      aw.translate(x + w / 2, 3.05, frontZ + 0.6);
      awningParts.push(paint(aw, AWN[Math.floor(bRnd() * AWN.length)]));
      const slot = Math.floor(bRnd() * signWords.length);
      const sw = Math.min(w * 0.62, 4.6);
      const pl = new THREE.PlaneGeometry(sw, sw / 4);
      pl.translate(x + w / 2, 3.65, frontZ + 0.03);
      const uv = pl.getAttribute('uv') as THREE.BufferAttribute;
      const u0 = (slot % 2) * 0.5;
      const v0 = 1 - (Math.floor(slot / 2) + 1) * 0.25;
      for (let i = 0; i < 4; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.25);
      signParts.push(pl.toNonIndexed());
      pl.dispose();
    };

    const addRow = (frontZ: number, kind: 'front' | 'back') => {
      let x = X0 - 14;
      while (x < X1 + 20) {
        const r = bRnd();
        const tint = SAND[Math.floor(bRnd() * SAND.length)];
        if (kind === 'front') {
          if (r < 0.34) {
            // maison à étage, toit plat, boutique au rez-de-chaussée
            const w = 9 + bRnd() * 5;
            const d = 8 + bRnd() * 3;
            wallBox(x, w, 7.2, d, frontZ, tint);
            flatRoof(x + w / 2, w, d, 7.2, frontZ);
            shopFront(x, w, frontZ);
            x += w + 2 + bRnd() * 7;
          } else if (r < 0.72) {
            // maison basse, toit en tôle à deux pans
            const w = 8 + bRnd() * 4;
            const d = 7 + bRnd() * 2;
            wallBox(x, w, 3.2, d, frontZ, tint);
            gable(x + w / 2, w, d, 3.2, 1.5, frontZ);
            if (bRnd() < 0.5) shopFront(x, w, frontZ);
            x += w + 2 + bRnd() * 8;
          } else {
            // rangée d'étals : petite boîte et toit en tôle posé de biais
            const w = 3 + bRnd() * 3;
            const d = 3.2;
            wallBox(x, w, 2.4, d, frontZ + 0.3, tint);
            const roof = new THREE.BoxGeometry(w + 0.8, 0.07, d + 1.4);
            roof.rotateX(0.07);
            roof.translate(x + w / 2, 2.55, frontZ + 0.5 - d / 2 + 0.3);
            roofParts.push(paint(roof, RUST[Math.floor(bRnd() * RUST.length)]));
            x += w + 1.5 + bRnd() * 5;
          }
        } else {
          const w = 10 + bRnd() * 6;
          const d = 9 + bRnd() * 4;
          const tall = r < 0.45;
          const h = tall ? 7.2 + (bRnd() < 0.3 ? 3.4 : 0) : 3.2;
          wallBox(x, w, h, d, frontZ, tint);
          if (tall) flatRoof(x + w / 2, w, d, h, frontZ);
          else gable(x + w / 2, w, d, h, 1.7, frontZ);
          x += w + 3 + bRnd() * 12;
        }
      }
    };
    addRow(-12, 'front');
    addRow(-26, 'back');

    const wallMat = track(
      new THREE.MeshLambertMaterial({ map: wallTex, emissiveMap: litTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, vertexColors: true }),
    );
    const city = new THREE.Mesh(track(merged(wallParts)), wallMat);
    city.castShadow = true;
    city.receiveShadow = true;
    scene.add(city);
    const roofMat = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const roofs = new THREE.Mesh(track(merged(roofParts)), roofMat);
    roofs.castShadow = true;
    scene.add(roofs);
    const awningMat = track(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    scene.add(new THREE.Mesh(track(merged(awningParts)), awningMat));
    const signMat = track(new THREE.MeshBasicMaterial({ map: signAtlas, color: '#ffffff', toneMapped: false }));
    scene.add(new THREE.Mesh(track(merged(signParts)), signMat));

    /* ------------------------------------------------------------------ kiosques, parasols, personnages, motos garées */
    const kioskGeo = track(
      merged([
        paint(new THREE.BoxGeometry(1.8, 2.1, 1.8).translate(0, 1.05, 0), '#F4C20D'),
        paint(new THREE.BoxGeometry(1.86, 0.45, 1.86).translate(0, 1.9, 0), '#1E57B8'),
        paint(new THREE.BoxGeometry(1.4, 0.8, 0.06).translate(0, 1.2, 0.92), '#2A2F38'),
      ]),
    );
    const kioskMat = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const kRnd = rng(41);
    const kiosks = new THREE.InstancedMesh(kioskGeo, kioskMat, 9);
    for (let i = 0; i < 9; i++) {
      dummy.position.set(X0 + 30 + i * ((X1 - X0 - 60) / 9) + kRnd() * 18, 0, -8.1 - kRnd() * 1.4);
      dummy.rotation.set(0, (kRnd() - 0.5) * 0.3, 0);
      dummy.updateMatrix();
      kiosks.setMatrixAt(i, dummy.matrix);
    }
    kiosks.castShadow = true;
    scene.add(kiosks);

    const parasolGeo = track(
      merged([
        paint(new THREE.ConeGeometry(1.25, 0.5, 14).translate(0, 2.25, 0), '#ffffff'),
        paint(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 6).translate(0, 1.15, 0), '#8B93A1'),
      ]),
    );
    const PARASOL = ['#E53935', '#FDD835', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#F8F8F8'];
    const parasolMat = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const pRnd = rng(43);
    const PARA_N = 46;
    const parasols = new THREE.InstancedMesh(parasolGeo, parasolMat, PARA_N);
    for (let i = 0; i < PARA_N; i++) {
      dummy.position.set(X0 + pRnd() * (X1 - X0), 0, -7.0 - pRnd() * 3);
      dummy.rotation.set(0, pRnd() * 6, 0);
      dummy.scale.setScalar(0.85 + pRnd() * 0.4);
      dummy.updateMatrix();
      parasols.setMatrixAt(i, dummy.matrix);
      parasols.setColorAt(i, new THREE.Color(PARASOL[Math.floor(pRnd() * PARASOL.length)]));
    }
    dummy.scale.setScalar(1);
    scene.add(parasols);

    // Personnages debout devant les étals
    const CLOTH = ['#E53935', '#FDD835', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#F5F5F5', '#00ACC1'];
    const PEOPLE_N = 54;
    const bodies = new THREE.InstancedMesh(track(new THREE.CapsuleGeometry(0.2, 0.85, 3, 8).translate(0, 0.85, 0)), track(new THREE.MeshLambertMaterial({ color: '#ffffff' })), PEOPLE_N);
    const heads = new THREE.InstancedMesh(track(new THREE.SphereGeometry(0.13, 10, 8).translate(0, 1.62, 0)), track(new THREE.MeshLambertMaterial({ color: '#6B432B' })), PEOPLE_N);
    const hRnd = rng(47);
    for (let i = 0; i < PEOPLE_N; i++) {
      dummy.position.set(X0 + hRnd() * (X1 - X0), 0, -6.2 - hRnd() * 3.6);
      dummy.rotation.set(0, hRnd() * 6, 0);
      dummy.scale.setScalar(0.9 + hRnd() * 0.2);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      heads.setMatrixAt(i, dummy.matrix);
      bodies.setColorAt(i, new THREE.Color(CLOTH[Math.floor(hRnd() * CLOTH.length)]));
    }
    dummy.scale.setScalar(1);
    scene.add(bodies, heads);

    // Moto-taxi (zémidjan) : cadre jaune et bleu, conducteur en haut jaune et casque bleu
    const buildMoto = (rider: boolean) => {
      const parts: THREE.BufferGeometry[] = [
        paint(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12).rotateX(Math.PI / 2).translate(0.62, 0.3, 0), '#15171B'),
        paint(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 12).rotateX(Math.PI / 2).translate(-0.62, 0.3, 0), '#15171B'),
        paint(new THREE.BoxGeometry(1.3, 0.28, 0.2).translate(0, 0.56, 0), '#F4C20D'),
        paint(new THREE.BoxGeometry(0.5, 0.3, 0.26).translate(0.22, 0.8, 0), '#1E57B8'),
        paint(new THREE.BoxGeometry(0.62, 0.1, 0.24).translate(-0.3, 0.8, 0), '#1B1D22'),
        paint(new THREE.BoxGeometry(0.06, 0.62, 0.06).rotateZ(-0.35).translate(0.62, 0.66, 0), '#9AA1AE'),
        paint(new THREE.BoxGeometry(0.06, 0.06, 0.5).translate(0.52, 1.06, 0), '#1B1D22'),
      ];
      if (rider) {
        parts.push(
          paint(new THREE.BoxGeometry(0.3, 0.55, 0.42).translate(-0.12, 1.2, 0), '#F5C518'),
          paint(new THREE.BoxGeometry(0.42, 0.22, 0.36).translate(-0.05, 0.9, 0), '#274472'),
          paint(new THREE.SphereGeometry(0.14, 10, 8).translate(-0.04, 1.62, 0), '#1E6FD9'),
        );
      }
      return merged(parts);
    };
    const motoMat = track(new THREE.MeshLambertMaterial({ vertexColors: true }));

    const PARK_N = 38;
    const parked = new THREE.InstancedMesh(track(buildMoto(false)), motoMat, PARK_N);
    const mRnd = rng(53);
    for (let i = 0; i < PARK_N; i++) {
      dummy.position.set(X0 + mRnd() * (X1 - X0), 0, -5.6 - mRnd() * 1.6);
      dummy.rotation.set(0, mRnd() < 0.5 ? Math.PI / 2 + (mRnd() - 0.5) * 0.5 : -Math.PI / 2 + (mRnd() - 0.5) * 0.5, 0);
      dummy.updateMatrix();
      parked.setMatrixAt(i, dummy.matrix);
    }
    scene.add(parked);

    // Circulation en sens inverse : zémidjans et voitures, au rythme du défilement
    const ZEM_N = 26;
    const zems = new THREE.InstancedMesh(track(buildMoto(true)), motoMat, ZEM_N);
    const carBodyGeo = track(
      merged([
        paint(new THREE.BoxGeometry(3.7, 0.7, 1.6).translate(0, 0.62, 0), '#ffffff'),
        paint(new THREE.BoxGeometry(2.0, 0.6, 1.42).translate(-0.2, 1.22, 0), '#2A3440'),
        paint(new THREE.BoxGeometry(1.7, 0.06, 1.46).translate(-0.2, 1.55, 0), '#ffffff'),
        paint(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10).rotateX(Math.PI / 2).translate(1.2, 0.3, 0.7), '#15171B'),
        paint(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10).rotateX(Math.PI / 2).translate(1.2, 0.3, -0.7), '#15171B'),
        paint(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10).rotateX(Math.PI / 2).translate(-1.2, 0.3, 0.7), '#15171B'),
        paint(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10).rotateX(Math.PI / 2).translate(-1.2, 0.3, -0.7), '#15171B'),
      ]),
    );
    const OCAR_N = 9;
    const ocars = new THREE.InstancedMesh(carBodyGeo, motoMat, OCAR_N);
    const CARCOL = ['#F4F5F7', '#C9CDD3', '#8B9099', '#F4F5F7', '#2B2F36', '#F4F5F7', '#B8BCC4', '#F4F5F7', '#9CA3AF'];
    CARCOL.forEach((c, i) => ocars.setColorAt(i, new THREE.Color(c)));
    const onLightsMat = track(new THREE.MeshBasicMaterial({ color: '#FFF3C4', toneMapped: false, transparent: true, opacity: 0 }));
    const onLights = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.06, 0.14, 0.3)), onLightsMat, ZEM_N + OCAR_N * 2);
    const oRnd = rng(61);
    type Onc = { x0: number; z: number; speed: number };
    const oncZ: Onc[] = Array.from({ length: ZEM_N }, () => ({ x0: oRnd() * SPAN, z: -1.0 - oRnd() * 2.0, speed: 0.45 + oRnd() * 0.5 }));
    const oncC: Onc[] = Array.from({ length: OCAR_N }, () => ({ x0: oRnd() * SPAN, z: -1.9 - oRnd() * 0.6, speed: 0.6 + oRnd() * 0.5 }));
    scene.add(zems, ocars, onLights);

    /* ------------------------------------------------------------------ palmiers */
    const palmParts: THREE.BufferGeometry[] = [];
    {
      const trunk = new THREE.CylinderGeometry(0.1, 0.17, 7.6, 7, 6);
      trunk.translate(0, 3.8, 0);
      const tp = trunk.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + Math.pow(tp.getY(i) / 7.6, 2) * 0.9);
      palmParts.push(paint(trunk, '#7A6A55'));
      for (let i = 0; i < 9; i++) {
        const frond = new THREE.PlaneGeometry(1.15, 3.8, 1, 5);
        const fp = frond.getAttribute('position') as THREE.BufferAttribute;
        for (let k = 0; k < fp.count; k++) {
          const along = (fp.getY(k) + 1.9) / 3.8; // 0 → 1 le long de la palme
          const wid = fp.getX(k) * (1 - along * 0.8);
          fp.setXYZ(k, wid, -along * along * 1.6, along * 3.6);
        }
        frond.rotateY((i / 9) * Math.PI * 2 + (i % 2) * 0.2);
        frond.translate(0.9, 7.5, 0);
        palmParts.push(paint(frond, i % 2 ? '#3F7A3C' : '#52913F'));
      }
    }
    const palmGeo = track(merged(palmParts));
    const palmMat = track(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    const PALM_N = 90;
    const palms = new THREE.InstancedMesh(palmGeo, palmMat, PALM_N);
    const plRnd = rng(71);
    for (let i = 0; i < PALM_N; i++) {
      const r = plRnd();
      const z = r < 0.55 ? -5.8 - plRnd() * 5.5 : r < 0.82 ? -40 - plRnd() * 8 : 6.5 + plRnd() * 5;
      dummy.position.set(X0 + plRnd() * (X1 - X0), 0, z);
      dummy.rotation.set(0, plRnd() * 6.28, 0);
      dummy.scale.setScalar(0.8 + plRnd() * 0.55);
      dummy.updateMatrix();
      palms.setMatrixAt(i, dummy.matrix);
    }
    dummy.scale.setScalar(1);
    palms.castShadow = true;
    scene.add(palms);

    /* ------------------------------------------------------------------ poteaux électriques et fils */
    const wireMat = track(new THREE.LineBasicMaterial({ color: '#1A1A1A' }));
    const POLE_Z = -6.8;
    const poleXs: number[] = [];
    for (let x = X0 + 6; x < X1; x += 34) poleXs.push(x + (plRnd() - 0.5) * 6);
    const woodMat = track(new THREE.MeshLambertMaterial({ color: '#6A5A47' }));
    const woodPoles = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.1, 0.14, 9, 7)), woodMat, poleXs.length);
    const crossArms = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.1, 0.1, 1.8)), woodMat, poleXs.length);
    poleXs.forEach((x, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(x, 4.5, POLE_Z);
      dummy.updateMatrix();
      woodPoles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 8.6, POLE_Z);
      dummy.updateMatrix();
      crossArms.setMatrixAt(i, dummy.matrix);
    });
    scene.add(woodPoles, crossArms);
    const wirePts: number[] = [];
    for (let i = 0; i < poleXs.length - 1; i++) {
      for (const dz of [-0.8, 0, 0.8]) {
        let px = poleXs[i];
        let py = 8.6;
        for (let s = 1; s <= 8; s++) {
          const t = s / 8;
          const nx = lerp(poleXs[i], poleXs[i + 1], t);
          const ny = 8.6 - Math.sin(t * Math.PI) * 0.7;
          wirePts.push(px, py, POLE_Z + dz, nx, ny, POLE_Z + dz);
          px = nx;
          py = ny;
        }
      }
    }
    const wireGeo = track(new THREE.BufferGeometry());
    wireGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wirePts), 3));
    scene.add(new THREE.LineSegments(wireGeo, wireMat));

    /* ------------------------------------------------------------------ lampadaires (éclairage orangé) */
    const lamps: { x: number; z: number; dir: number }[] = [];
    for (let x = X0; x < X1; x += 36) lamps.push({ x, z: -4.9, dir: 1 });
    for (let x = X0 + 18; x < X1; x += 72) lamps.push({ x, z: 4.9, dir: -1 });
    const poleMat = track(new THREE.MeshLambertMaterial({ color: '#7B8494' }));
    const poles = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.07, 0.1, 7.4, 8)), poleMat, lamps.length);
    const arms = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.08, 0.08, 1.9)), poleMat, lamps.length);
    const headMat = track(new THREE.MeshBasicMaterial({ color: '#94A3B8', toneMapped: false }));
    const heads2 = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.36, 0.12, 0.55)), headMat, lamps.length);
    const haloMat = track(new THREE.MeshBasicMaterial({ color: '#FFB45E', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    const halos = new THREE.InstancedMesh(track(new THREE.SphereGeometry(0.75, 12, 8)), haloMat, lamps.length);
    const poolTex = track(
      canvasTexture(128, 128, (g) => {
        const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        r.addColorStop(0, 'rgba(255,170,90,0.9)');
        r.addColorStop(1, 'rgba(255,170,90,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 128, 128);
      }),
    );
    const poolMat = track(new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    const pools = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(10, 10)), poolMat, lamps.length);
    lamps.forEach((l, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(l.x, 3.7, l.z);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x, 7.4, l.z + l.dir * 0.95);
      dummy.updateMatrix();
      arms.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x, 7.34, l.z + l.dir * 1.8);
      dummy.updateMatrix();
      heads2.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x, 7.2, l.z + l.dir * 1.8);
      dummy.updateMatrix();
      halos.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x, 0.05, l.z + l.dir * 1.8 - l.dir * 1.2);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      pools.setMatrixAt(i, dummy.matrix);
    });
    dummy.rotation.set(0, 0, 0);
    scene.add(poles, arms, heads2, halos, pools);

    /* ------------------------------------------------------------------ panneaux routiers et affiches */
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
      const face = track(new THREE.MeshBasicMaterial({ map: tex, color: '#ffffff', toneMapped: false }));
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

    // Affiches publicitaires au bord de la route, dont la nôtre
    const adFaces: THREE.MeshBasicMaterial[] = [];
    const adTex = (draw: (g: CanvasRenderingContext2D) => void) => track(canvasTexture(512, 256, draw));
    const tamcarAd = adTex((g) => {
      const grad = g.createLinearGradient(0, 0, 512, 256);
      grad.addColorStop(0, '#1D4ED8');
      grad.addColorStop(1, '#0E7490');
      g.fillStyle = grad;
      g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.font = '800 60px system-ui, sans-serif';
      g.fillText('TamCar', 256, 100);
      g.font = '700 30px system-ui, sans-serif';
      g.fillText('Ta course est claire,', 256, 160);
      g.fillText('ta course éclair.', 256, 202);
    });
    const plainAd = adTex((g) => {
      g.fillStyle = '#F5F0E6';
      g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#C2410C';
      g.fillRect(0, 0, 512, 40);
      g.fillStyle = '#374151';
      g.fillRect(40, 80, 200, 140);
      g.fillStyle = '#9CA3AF';
      g.fillRect(270, 90, 200, 20);
      g.fillRect(270, 130, 160, 20);
      g.fillRect(270, 170, 120, 20);
    });
    [
      { tex: tamcarAd, x: 30 },
      { tex: plainAd, x: 95 },
      { tex: tamcarAd, x: END_X * 0.55 },
      { tex: plainAd, x: END_X * 0.8 },
    ].forEach(({ tex, x }) => {
      const m = track(new THREE.MeshBasicMaterial({ map: tex, color: '#ffffff', toneMapped: false }));
      adFaces.push(m);
      const panel = new THREE.Mesh(track(new THREE.PlaneGeometry(6, 3)), m);
      panel.position.set(x, 5.4, -8.3);
      const frame = new THREE.Mesh(track(new THREE.BoxGeometry(6.2, 3.2, 0.12)), poleMat);
      frame.position.set(x, 5.4, -8.4);
      [-2, 2].forEach((dx) => {
        const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.09, 4, 8)), poleMat);
        post.position.set(x + dx, 2, -8.5);
        scene.add(post);
      });
      scene.add(frame, panel);
    });

    /* ------------------------------------------------------------------ le véhicule TamCar : citadine blanche */
    const car = new THREE.Group();
    const bodyMat = track(new THREE.MeshPhysicalMaterial({ color: '#F3F5F8', roughness: 0.32, metalness: 0.08, clearcoat: 0.7, clearcoatRoughness: 0.12 }));
    const glassMat = track(new THREE.MeshPhysicalMaterial({ color: '#27303D', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.82, clearcoat: 1 }));
    const trimMat = track(new THREE.MeshStandardMaterial({ color: '#1B1E24', roughness: 0.7 }));
    const shape = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const lowerGeo = track(
      new THREE.ExtrudeGeometry(
        shape([
          [-1.88, 0.3],
          [-1.9, 0.72],
          [-1.62, 0.9],
          [-0.9, 0.94],
          [0.95, 0.96],
          [1.62, 0.88],
          [1.9, 0.7],
          [1.9, 0.32],
        ]),
        { depth: 1.55, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 3, curveSegments: 6 },
      ),
    );
    lowerGeo.translate(0, 0, -0.775);
    car.add(new THREE.Mesh(lowerGeo, bodyMat));
    const cabinGeo = track(
      new THREE.ExtrudeGeometry(
        shape([
          [-1.55, 0.92],
          [-1.08, 1.4],
          [0.42, 1.46],
          [1.08, 0.96],
        ]),
        { depth: 1.42, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 },
      ),
    );
    cabinGeo.translate(0, 0, -0.71);
    car.add(new THREE.Mesh(cabinGeo, glassMat));
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(1.52, 0.06, 1.44)), bodyMat);
    roof.position.set(-0.32, 1.47, 0);
    roof.rotation.z = -0.02;
    car.add(roof);
    // Montants de pare-brise et de lunette arrière
    const aGeo = track(new THREE.BoxGeometry(0.07, 0.8, 0.07));
    [0.7, -0.7].forEach((z) => {
      const a = new THREE.Mesh(aGeo, bodyMat);
      a.position.set(0.75, 1.18, z);
      a.rotation.z = 0.78;
      const c = new THREE.Mesh(aGeo, bodyMat);
      c.position.set(-1.32, 1.16, z);
      c.rotation.z = -0.72;
      car.add(a, c);
    });
    const pillar = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.52, 1.44)), bodyMat);
    pillar.position.set(-0.3, 1.18, 0);
    car.add(pillar);
    // Conducteur visible par les vitres (conduite à gauche : côté -z)
    const darkMat = track(new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.8 }));
    const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.14, 14, 10)), darkMat);
    head.position.set(0.12, 1.2, -0.36);
    const torso = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.17, 0.26, 4, 10)), darkMat);
    torso.position.set(0.08, 0.94, -0.36);
    car.add(head, torso);
    // Pare-chocs, calandre, plaques, antenne
    const bumperF = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.3, 1.6)), trimMat);
    bumperF.position.set(1.93, 0.46, 0);
    const bumperR = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.26, 1.6)), trimMat);
    bumperR.position.set(-1.93, 0.46, 0);
    const grille = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.16, 0.8)), trimMat);
    grille.position.set(1.96, 0.7, 0);
    const plateMat = track(new THREE.MeshStandardMaterial({ color: '#E9EBEE', roughness: 0.5 }));
    const plateF = new THREE.Mesh(track(new THREE.BoxGeometry(0.03, 0.13, 0.4)), plateMat);
    plateF.position.set(2.02, 0.44, 0);
    const plateR = new THREE.Mesh(track(new THREE.BoxGeometry(0.03, 0.13, 0.4)), plateMat);
    plateR.position.set(-2.0, 0.55, 0);
    const antenna = new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6)), trimMat);
    antenna.position.set(-1.1, 1.74, 0.32);
    antenna.rotation.z = 0.18;
    car.add(bumperF, bumperR, grille, plateF, plateR, antenna);

    // Roues : pneu, jante alliage, rayons ; un disque noir derrière chaque roue figure le passage de roue
    const tireMat = track(new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.9 }));
    const rimMat = track(new THREE.MeshStandardMaterial({ color: '#D5DAE1', roughness: 0.25, metalness: 0.8 }));
    const spokeMat = track(new THREE.MeshStandardMaterial({ color: '#8B93A1', roughness: 0.35, metalness: 0.7 }));
    const tireGeo = track(new THREE.CylinderGeometry(0.31, 0.31, 0.24, 28).rotateX(Math.PI / 2));
    const rimGeo = track(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 20).rotateX(Math.PI / 2));
    const spokeParts = [0, 1, 2, 3, 4].map((i) => new THREE.BoxGeometry(0.05, 0.36, 0.26).rotateZ((i * Math.PI * 2) / 5).toNonIndexed());
    const spokeGeo = track(merged(spokeParts));
    const archMat = track(new THREE.MeshBasicMaterial({ color: '#05070D', side: THREE.DoubleSide }));
    const archGeo = track(new THREE.CircleGeometry(0.4, 24));
    const wheels: THREE.Group[] = [];
    [
      [1.22, 0.8],
      [1.22, -0.8],
      [-1.2, 0.8],
      [-1.2, -0.8],
    ].forEach(([x, z]) => {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(tireGeo, tireMat), new THREE.Mesh(rimGeo, rimMat), new THREE.Mesh(spokeGeo, spokeMat));
      w.position.set(x, 0.31, z);
      car.add(w);
      wheels.push(w);
      const arch = new THREE.Mesh(archGeo, archMat);
      arch.position.set(x, 0.34, z > 0 ? 0.79 : -0.79);
      car.add(arch);
    });

    // Livrée : le logo TamCar sur les portières (le fichier existe déjà sur le site)
    const logoMat = track(new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, alphaTest: 0.02 }));
    const logoGeo = track(new THREE.PlaneGeometry(0.86, 0.686));
    new THREE.TextureLoader().load('/logo.png', (tex) => {
      if (cancelled.v) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      logoMat.map = tex;
      logoMat.needsUpdate = true;
      track(tex);
    });
    [0.842, -0.842].forEach((z) => {
      const d = new THREE.Mesh(logoGeo, logoMat);
      d.position.set(0.12, 0.62, z);
      if (z < 0) d.rotation.y = Math.PI;
      car.add(d);
    });

    // Phares, feux arrière, faisceaux
    const spots: THREE.SpotLight[] = [];
    const headLampMat = track(new THREE.MeshStandardMaterial({ color: '#FEF9C3', emissive: new THREE.Color('#FEF9C3'), emissiveIntensity: 0.3 }));
    const tailMat = track(new THREE.MeshStandardMaterial({ color: '#EF4444', emissive: new THREE.Color('#EF4444'), emissiveIntensity: 0.4 }));
    const lampGeo = track(new THREE.BoxGeometry(0.06, 0.13, 0.34));
    [0.56, -0.56].forEach((z) => {
      const h = new THREE.Mesh(lampGeo, headLampMat);
      h.position.set(1.95, 0.78, z);
      const t = new THREE.Mesh(lampGeo, tailMat);
      t.position.set(-1.93, 0.78, z);
      car.add(h, t);
      const spot = new THREE.SpotLight('#FFF3C4', 0, 45, 0.5, 0.6, 1.4);
      spot.position.set(1.9, 0.78, z);
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
      new THREE.MeshBasicMaterial({ color: '#FEF9C3', transparent: true, opacity: 0, alphaMap: beamAlpha, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }),
    );
    const beamGeo = track(new THREE.ConeGeometry(2.4, 12, 28, 1, true).rotateZ(Math.PI / 2).translate(6, 0, 0));
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(1.95, 0.78, 0);
    beam.rotation.z = -0.03;
    car.add(beam);

    // Ombre portée douce sous le véhicule (en plus de l'ombre du soleil)
    const shadowTex = track(
      canvasTexture(
        128,
        64,
        (g) => {
          const r = g.createRadialGradient(64, 32, 4, 64, 32, 62);
          r.addColorStop(0, 'rgba(0,0,0,0.5)');
          r.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = r;
          g.fillRect(0, 0, 128, 64);
        },
        false,
      ),
    );
    const blob = new THREE.Mesh(
      track(new THREE.PlaneGeometry(5.2, 2.5)),
      track(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(0, 0.03, 0);
    car.add(blob);
    car.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && o !== blob && o !== head && o !== torso && o !== beam) m.castShadow = true;
    });
    scene.add(car);

    /* ------------------------------------------------------------------ ciel : astres et étoiles fixés à la caméra */
    const sky = new THREE.Group();
    camera.add(sky);
    const sunMat = track(new THREE.MeshBasicMaterial({ color: '#FFF1C2', transparent: true, fog: false, toneMapped: false }));
    const sunHaloMat = track(new THREE.MeshBasicMaterial({ color: '#FFF4D6', transparent: true, opacity: 0.3, fog: false, toneMapped: false }));
    const sun = new THREE.Mesh(track(new THREE.SphereGeometry(3.2, 20, 14)), sunMat);
    const sunHalo = new THREE.Mesh(track(new THREE.SphereGeometry(6.2, 20, 14)), sunHaloMat);
    sun.add(sunHalo);
    const moonMat = track(new THREE.MeshBasicMaterial({ color: '#F1F5F9', transparent: true, fog: false, toneMapped: false }));
    const moon = new THREE.Mesh(track(new THREE.SphereGeometry(3, 20, 14)), moonMat);
    const starRnd = rng(5);
    const starPos = new Float32Array(260 * 3);
    const starMat = track(new THREE.PointsMaterial({ color: '#ffffff', size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, toneMapped: false }));
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
      const bob = Math.sin((xc / 0.31) * 1.1) * (p < 0.995 ? 0.01 : 0);
      car.position.set(xc, bob, CAR_Z);
      wheels.forEach((w) => (w.rotation.z = -xc / 0.31));

      // Circulation en sens inverse : leur position dépend du trajet parcouru
      oncZ.forEach((o, i) => {
        const x = X0 + ((((o.x0 - o.speed * xc) % SPAN) + SPAN) % SPAN);
        dummy.position.set(x, 0, o.z);
        dummy.rotation.set(0, Math.PI, 0);
        dummy.updateMatrix();
        zems.setMatrixAt(i, dummy.matrix);
        dummy.position.set(x - 0.75, 0.62, o.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        onLights.setMatrixAt(i, dummy.matrix);
      });
      oncC.forEach((o, i) => {
        const x = X0 + ((((o.x0 - o.speed * xc) % SPAN) + SPAN) % SPAN);
        dummy.position.set(x, 0, o.z);
        dummy.rotation.set(0, Math.PI, 0);
        dummy.updateMatrix();
        ocars.setMatrixAt(i, dummy.matrix);
        [0.55, -0.55].forEach((dz, k) => {
          dummy.position.set(x - 1.86, 0.62, o.z - dz);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          onLights.setMatrixAt(ZEM_N + i * 2 + k, dummy.matrix);
        });
      });
      zems.instanceMatrix.needsUpdate = true;
      ocars.instanceMatrix.needsUpdate = true;
      onLights.instanceMatrix.needsUpdate = true;
      dummy.rotation.set(0, 0, 0);

      // Lumières et couleurs du jour → nuit (jour poussiéreux, brume beige)
      hemi.color.set(mix('#E8EEF8', '#26346B', night));
      hemi.groundColor.set(mix('#B58A63', '#0A0F24', night));
      hemi.intensity = lerp(1.1, 0.9, night);
      sunLight.color.set(mix('#FFF0D2', '#7C93D6', night));
      sunLight.intensity = lerp(2.0, 0.45, night);
      sunLight.position.set(xc + 24, 40, 30);
      sunLight.target.position.set(xc, 0, 0);
      scene.environmentIntensity = lerp(0.85, 0.2, night);
      renderer.toneMappingExposure = lerp(1.05, 1.15, night);
      const skyBot = mix(SKY_BOT[0], SKY_BOT[1], night);
      const skyTop = mix(SKY_TOP[0], SKY_TOP[1], night);
      (scene.fog as THREE.Fog).color.set(skyBot);
      groundMat.color.set(mix('#E6D3C0', '#2A2530', night));
      roadMat.color.set(mix('#EDEDED', '#2A2F3A', night));
      curbMat.color.set(mix('#FFFFFF', '#3A3E4A', night));
      lineMat.color.set(mix('#EDEDED', '#7B8396', night));
      wallMat.emissiveIntensity = night * 1.3;
      headMat.color.set(mix('#94A3B8', '#FFC97A', night));
      haloMat.opacity = night * 0.45;
      poolMat.opacity = night * 0.6;
      headLampMat.emissiveIntensity = 0.3 + night * 3;
      tailMat.emissiveIntensity = 0.4 + night * 1.2;
      beamMat.opacity = night * 0.5;
      onLightsMat.opacity = night;
      spots.forEach((s) => (s.intensity = night * 150));
      const dim = mix('#FFFFFF', '#8C94A8', night);
      signFaces.forEach((m) => m.color.set(dim));
      adFaces.forEach((m) => m.color.set(dim));
      signMat.color.set(dim);
      bodyMat.emissive.set('#1B3FA0');
      bodyMat.emissiveIntensity = night * 0.12;
      starMat.opacity = night * 0.9;

      // Caméra : plan du chapitre, décalé par rapport au véhicule (plus loin sur un écran étroit)
      const c = camAt(p);
      const zoom = 1 + Math.max(0, Math.min(0.9, (1.15 - sizes.aspect) * 1.1));
      const k = Math.max(0.2, Math.min(1, sizes.aspect / 1.3));
      const look = new THREE.Vector3(xc + c.look[0] * k, c.look[1], c.look[2]);
      const pos = new THREE.Vector3(xc + c.pos[0] * (0.4 + 0.6 * k), c.pos[1], c.pos[2]);
      pos.sub(look).multiplyScalar(zoom).add(look);
      camera.position.copy(pos);
      camera.lookAt(look);
      camera.updateMatrixWorld();

      // Astres : le soleil (voilé) se couche, la lune se lève
      sun.position.set(sizes.halfW * 0.72, lerp(sizes.halfH * 0.55, -sizes.halfH * 0.25, night), 0);
      moon.position.set(sizes.halfW * 0.72, lerp(-sizes.halfH * 0.3, sizes.halfH * 0.55, night), 0);
      sunMat.opacity = (1 - night) * 0.9;
      sunHaloMat.opacity = 0.3 * (1 - night);
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
      cancelled.v = true;
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
