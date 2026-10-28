'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useJourneyFrame } from './JourneyShell';
import { HUD_H, HUD_W, HudPanels, updateHud } from './JourneyHud';
import { TOTAL, lerp, nightAt, smooth, travelAt } from './journey-shared';
import { canvasTexture, createWorld, skyColors, type Disposable } from './world3d';
import { createCar } from './car3d';

/**
 * Version 3D de la route des clients (three.js, sans fichier de modèle). Une voiture blanche TamCar roule dans un
 * Cotonou / Porto-Novo imaginé (voir world3d.ts) ; la caméra tourne autour d'elle d'un chapitre à l'autre ; le jour
 * tombe. Les panneaux d'information du chapitre se superposent à la scène.
 * Ne dessine que pendant que la page défile. `onFail` : WebGL absent, erreur ou appareil trop lent → repli en 2D.
 */

const K = 0.06; // mètres par unité de distance du trajet
const END_X = TOTAL * 0.95 * K; // position d'arrivée du véhicule (m)
const X0 = -50;
const X1 = END_X + 100;
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
    const camera = new THREE.PerspectiveCamera(FOV, 2, 0.1, 700);
    scene.add(camera);
    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

    const world = createWorld(scene, camera, renderer, track, { x0: X0, x1: X1 });
    const carRig = createCar(track, maxAniso, cancelled);
    scene.add(carRig.group);

    // Panneaux de départ et d'arrivée
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
      world.dimmed(face);
      const plate = new THREE.Mesh(track(new THREE.PlaneGeometry(7.2, 1.8)), face);
      plate.position.set(x, 3.7, -4.6);
      const back = new THREE.Mesh(track(new THREE.BoxGeometry(7.4, 2, 0.1)), world.poleMat);
      back.position.set(x, 3.7, -4.68);
      [-2.8, 2.8].forEach((dx) => {
        const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 8)), world.poleMat);
        post.position.set(x + dx, 1.5, -4.7);
        scene.add(post);
      });
      scene.add(back, plate);
    };
    addSign('Cotonou', '#1D4ED8', 13);
    addSign('Porto-Novo', '#15803D', END_X + 16);

    // Affiches publicitaires au bord de la route, dont la nôtre
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
    world.addAd(30, tamcarAd);
    world.addAd(95, plainAd);
    world.addAd(END_X * 0.55, tamcarAd);
    world.addAd(END_X * 0.8, plainAd);

    /* ------------------------------------------------------------------ taille, dessin */
    const sizes = { w: 1, h: 1, aspect: 2 };
    const layout = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      sizes.w = w;
      sizes.h = h;
      sizes.aspect = w / h;
      camera.aspect = sizes.aspect;
      camera.updateProjectionMatrix();
      world.layout(sizes.aspect);
      hud.style.width = `${Math.min(HUD_W, Math.max(240, w * 0.92))}px`;
    };

    const horizon = new THREE.Vector3();
    const dir = new THREE.Vector3();

    const draw = (p: number) => {
      const night = nightAt(p);
      const xc = TOTAL * travelAt(p) * K;
      const bob = Math.sin((xc / 0.31) * 1.1) * (p < 0.995 ? 0.01 : 0);
      carRig.group.position.set(xc, bob, CAR_Z);
      carRig.update(night, xc);
      carRig.bodyMat.emissive.set('#1B3FA0');
      carRig.bodyMat.emissiveIntensity = night * 0.12;
      world.update(night, xc);

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

      // Le ciel (dégradé CSS derrière le canvas transparent) s'aligne sur la ligne d'horizon
      const sky = skyColors(night);
      camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      horizon.copy(camera.position).addScaledVector(dir, 2000).project(camera);
      const yH = Math.min(96, Math.max(4, ((1 - horizon.y) / 2) * 100));
      bg.style.background = `linear-gradient(to bottom, ${sky.top} 0%, ${sky.bottom} ${yH}%, ${sky.bottom} 100%)`;

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
      <div ref={bgRef} className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, #8FB9E8, #F0E2C8)' }} />
      <div ref={hostRef} className="absolute inset-0" />
      <svg ref={hudRef} className="absolute left-1/2 top-[3%] -translate-x-1/2 font-sans" viewBox={`0 0 ${HUD_W} ${HUD_H + 20}`} style={{ width: HUD_W }} focusable="false">
        <HudPanels />
      </svg>
    </div>
  );
}
