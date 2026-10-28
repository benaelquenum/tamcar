'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useJourneyFrame } from './JourneyShell';
import { HUD_H, HUD_W } from './JourneyHud';
import { HudPanelsPartner, updatePartnerHud } from './JourneyHudPartner';
import { PARTNER_STEPS, TOTAL, clamp01, frameFor, lerp, partnerNight, smooth, stepWin, travelAt } from './journey-shared';
import { buildMoto, buildSimpleCar, buildTricycle, canvasTexture, createWorld, skyColors, type Disposable } from './world3d';
import { createCar } from './car3d';
import { FLEET_MAX, fleetStore } from './partner-fleet';

/**
 * Version 3D de la route des partenaires : « une journée de votre véhicule ». Du petit matin au soir, la caméra suit la
 * citadine TamCar : trois feux qui passent au vert, l'inspection d'entrée, la carte grise qui reste attachée au véhicule
 * (réserve de propriété), le chauffeur vérifié, les gains qui s'affichent à chaque course, puis une vue d'en haut où le
 * véhicule devient une flotte. AUCUN chiffre de politique partenaire : seulement des signes.
 * Ne dessine que pendant que la page défile. `onFail` : WebGL absent, erreur ou appareil trop lent → repli en 2D.
 */

const K = 0.06; // mètres par unité de distance du trajet
const END_X = TOTAL * 0.95 * K;
const X0 = -50;
const X1 = END_X + 100;
const CAR_Z = 1.7;
const FOV = 42;
const FPS_MIN = 22;

const LIGHTS_X = [30, 50, 70]; // les trois feux
const PORTAL_X = 112; // le portique d'inspection
const POP_START = 236; // début des « + » de gains (m)
const POP_N = 7;

type Key = { p: number; pos: [number, number, number]; look: [number, number, number] };
/** Plans de caméra : décalage en x par rapport au véhicule, hauteur, z absolu. */
const KEYS: Key[] = [
  { p: 0.0, pos: [-9.0, 3.2, 10.0], look: [3.0, 1.2, 1.7] },
  { p: 0.115, pos: [-3.0, 4.0, 11.0], look: [9.0, 1.6, 0.6] },
  { p: 0.27, pos: [3.0, 2.8, 9.2], look: [4.0, 1.5, 0.8] },
  { p: 0.43, pos: [-2.0, 3.6, 10.5], look: [1.5, 2.3, 1.5] },
  { p: 0.585, pos: [3.2, 1.7, 6.6], look: [2.0, 1.1, 1.5] },
  { p: 0.735, pos: [0.0, 3.4, 11.5], look: [3.0, 2.2, 1.5] },
  { p: 0.9, pos: [-4.0, 13.0, 19.0], look: [4.0, 0.0, 0.5] },
  { p: 1.0, pos: [-4.0, 13.0, 19.0], look: [4.0, 0.0, 0.5] },
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

/** Emplacements de la flotte autour du véhicule principal (le 0) : type, décalage en x, voie. */
const SLOTS: { t: 'car' | 'moto' | 'tri'; dx: number; z: number }[] = [
  { t: 'car', dx: 0, z: CAR_Z },
  { t: 'moto', dx: -7, z: 2.9 },
  { t: 'tri', dx: -14, z: 0.7 },
  { t: 'car', dx: 9, z: 2.7 },
  { t: 'moto', dx: -22, z: 1.4 },
  { t: 'car', dx: 16, z: 0.7 },
  { t: 'tri', dx: 24, z: 2.8 },
  { t: 'moto', dx: -30, z: 0.9 },
  { t: 'car', dx: 33, z: 2.6 },
  { t: 'car', dx: -38, z: 2.2 },
  { t: 'tri', dx: 42, z: 1.0 },
  { t: 'moto', dx: -46, z: 1.8 },
];

export default function PartnerScene3D({ onFail }: { onFail: () => void }) {
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
    const dummy = new THREE.Object3D();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 2, 0.1, 700);
    scene.add(camera);
    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

    const world = createWorld(scene, camera, renderer, track, { x0: X0, x1: X1 });
    const carRig = createCar(track, maxAniso, cancelled);
    scene.add(carRig.group);
    fleetStore.reset();

    /* ------------------------------------------------------------------ affiches (aucun chiffre) */
    const adTex = (draw: (g: CanvasRenderingContext2D) => void) => track(canvasTexture(512, 256, draw));
    const partnerAd = adTex((g) => {
      const grad = g.createLinearGradient(0, 0, 512, 256);
      grad.addColorStop(0, '#0E7490');
      grad.addColorStop(1, '#1D4ED8');
      g.fillStyle = grad;
      g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.font = '800 54px system-ui, sans-serif';
      g.fillText('TamCar', 256, 90);
      g.font = '700 28px system-ui, sans-serif';
      g.fillText('Partenaires véhicule', 256, 146);
      g.font = '600 24px system-ui, sans-serif';
      g.fillText('Votre véhicule travaille pour vous.', 256, 196);
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
    world.addAd(44, partnerAd);
    world.addAd(150, plainAd);
    world.addAd(END_X * 0.62, partnerAd);
    world.addAd(END_X * 0.86, plainAd);

    /* ------------------------------------------------------------------ chapitre 1 : trois feux qui passent au vert */
    const ON = ['#FF3B30', '#FFB020', '#22E06B'];
    const lightRigs = LIGHTS_X.map((x) => {
      const g = new THREE.Group();
      g.position.set(x, 0, -4.4);
      const mast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.11, 5, 8)), world.poleMat);
      mast.position.set(0, 2.5, 0);
      const housing = new THREE.Mesh(track(new THREE.BoxGeometry(0.58, 1.34, 0.42)), track(new THREE.MeshLambertMaterial({ color: '#15181E' })));
      housing.position.set(0, 4.5, 0.3);
      g.add(mast, housing);
      const mats: THREE.MeshBasicMaterial[] = [];
      const halos: THREE.MeshBasicMaterial[] = [];
      [0.42, 0, -0.42].forEach((dy, i) => {
        const m = track(new THREE.MeshBasicMaterial({ color: '#2A2A2A', toneMapped: false }));
        const lamp = new THREE.Mesh(track(new THREE.CircleGeometry(0.17, 20)), m);
        lamp.position.set(0, 4.5 + dy, 0.52);
        const hm = track(new THREE.MeshBasicMaterial({ color: ON[i], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
        const halo = new THREE.Mesh(track(new THREE.SphereGeometry(0.5, 14, 10)), hm);
        halo.position.set(0, 4.5 + dy, 0.6);
        g.add(lamp, halo);
        mats.push(m);
        halos.push(hm);
      });
      scene.add(g);
      return { x, mats, halos };
    });

    /* ------------------------------------------------------------------ chapitre 2 : le portique d'inspection */
    const portal = new THREE.Group();
    portal.position.set(PORTAL_X, 0, 0);
    [-3.5, 3.5].forEach((z) => {
      const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.12, 0.14, 4.4, 10)), world.poleMat);
      post.position.set(0, 2.2, z);
      portal.add(post);
    });
    const topBar = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.34, 7.4)), world.poleMat);
    topBar.position.set(0, 4.5, 0);
    portal.add(topBar);
    const portalSignTex = track(
      canvasTexture(512, 128, (g) => {
        g.fillStyle = '#0F766E';
        g.fillRect(0, 0, 512, 128);
        g.strokeStyle = '#fff';
        g.lineWidth = 8;
        g.strokeRect(8, 8, 496, 112);
        g.fillStyle = '#fff';
        g.font = '800 50px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('INSPECTION', 256, 68);
      }),
    );
    const portalSignMat = track(new THREE.MeshBasicMaterial({ map: portalSignTex, toneMapped: false }));
    world.dimmed(portalSignMat);
    const portalSign = new THREE.Mesh(track(new THREE.PlaneGeometry(3.4, 0.85)), portalSignMat);
    portalSign.position.set(0.3, 5.3, -3.2);
    portal.add(portalSign);
    const scanMat = track(new THREE.MeshBasicMaterial({ color: '#22D3EE', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    const scanPlane = new THREE.Mesh(track(new THREE.PlaneGeometry(6.6, 3.8)), scanMat);
    scanPlane.rotation.y = Math.PI / 2;
    scanPlane.position.set(0, 2.1, 0);
    const lineMat = track(new THREE.MeshBasicMaterial({ color: '#CFFAFE', transparent: true, opacity: 0, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    const scanLine = new THREE.Mesh(track(new THREE.PlaneGeometry(6.6, 0.1)), lineMat);
    scanLine.rotation.y = Math.PI / 2;
    portal.add(scanPlane, scanLine);
    scene.add(portal);

    /* ------------------------------------------------------------------ chapitre 3 : la carte grise reste attachée au véhicule */
    const tagTex = track(
      canvasTexture(256, 168, (g) => {
        g.fillStyle = '#fff';
        g.fillRect(0, 0, 256, 168);
        g.fillStyle = '#2563EB';
        g.fillRect(0, 0, 256, 44);
        g.fillStyle = '#fff';
        g.font = '800 26px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('CARTE GRISE', 128, 24);
        g.fillStyle = '#CBD5E1';
        g.fillRect(18, 62, 150, 10);
        g.fillRect(18, 82, 110, 10);
        g.fillStyle = '#0F172A';
        g.font = '700 20px system-ui, sans-serif';
        g.textAlign = 'left';
        g.fillText('PROPRIÉTAIRE', 18, 122);
        g.fillStyle = '#16A34A';
        g.font = '800 26px system-ui, sans-serif';
        g.fillText('VOUS', 18, 150);
        g.fillStyle = '#FACC15';
        g.beginPath();
        g.arc(214, 118, 18, 0, Math.PI * 2);
        g.fill();
        g.fillRect(210, 128, 8, 22);
      }),
    );
    const tagMat = track(new THREE.MeshBasicMaterial({ map: tagTex, transparent: true, side: THREE.DoubleSide, toneMapped: false, opacity: 0 }));
    world.dimmed(tagMat);
    const tag = new THREE.Mesh(track(new THREE.PlaneGeometry(1.7, 1.12)), tagMat);
    scene.add(tag);
    const tetherMat = track(new THREE.MeshBasicMaterial({ color: '#22D3EE', transparent: true, opacity: 0, toneMapped: false, fog: false }));
    const tether = new THREE.Mesh(track(new THREE.CylinderGeometry(0.018, 0.018, 1, 6)), tetherMat);
    scene.add(tether);

    /* ------------------------------------------------------------------ chapitre 5 : un « + » à chaque course terminée */
    const popTex = track(
      canvasTexture(
        96,
        96,
        (g) => {
          g.fillStyle = '#16A34A';
          g.beginPath();
          g.arc(48, 48, 44, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#fff';
          g.lineWidth = 7;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(48, 26);
          g.lineTo(48, 70);
          g.moveTo(26, 48);
          g.lineTo(70, 48);
          g.stroke();
        },
        true,
      ),
    );
    const pops = Array.from({ length: POP_N }, () => {
      const m = track(new THREE.SpriteMaterial({ map: popTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }));
      const s = new THREE.Sprite(m);
      s.scale.set(0.8, 0.8, 0.8);
      s.visible = false;
      scene.add(s);
      return { s, m };
    });

    /* ------------------------------------------------------------------ chapitre 6 : la flotte */
    const fleetMat = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const groups = {
      car: SLOTS.map((s, i) => ({ s, i })).filter((o) => o.s.t === 'car' && o.i > 0),
      moto: SLOTS.map((s, i) => ({ s, i })).filter((o) => o.s.t === 'moto'),
      tri: SLOTS.map((s, i) => ({ s, i })).filter((o) => o.s.t === 'tri'),
    };
    const fleetCars = new THREE.InstancedMesh(track(buildSimpleCar()), fleetMat, groups.car.length);
    const fleetMotos = new THREE.InstancedMesh(track(buildMoto(true)), fleetMat, groups.moto.length);
    const fleetTris = new THREE.InstancedMesh(track(buildTricycle()), fleetMat, groups.tri.length);
    scene.add(fleetCars, fleetMotos, fleetTris);
    const markMat = track(new THREE.MeshBasicMaterial({ color: '#22D3EE', transparent: true, opacity: 0, toneMapped: false, fog: false }));
    const markers = new THREE.InstancedMesh(track(new THREE.OctahedronGeometry(0.3)), markMat, FLEET_MAX);
    scene.add(markers);
    // les instances suivent le véhicule sur 7 km : la sphère englobante calculée à la première image serait périmée
    [fleetCars, fleetMotos, fleetTris, markers].forEach((m) => (m.frustumCulled = false));

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
    const up = new THREE.Vector3(0, 1, 0);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const q = new THREE.Quaternion();

    const draw = (p: number) => {
      const night = partnerNight(p);
      const xc = TOTAL * travelAt(p) * K;
      const bob = Math.sin((xc / 0.31) * 1.1) * (p < 0.995 ? 0.01 : 0);
      carRig.group.position.set(xc, bob, CAR_Z);
      carRig.update(night, xc);
      world.update(night, xc);

      // 1 · feux : rouge, orange, puis vert à l'approche du véhicule
      lightRigs.forEach((l) => {
        const d = l.x - xc;
        const state = d > 22 ? 0 : d > 14 ? 1 : 2;
        l.mats.forEach((m, i) => m.color.set(i === state ? ON[i] : '#2A2A2A'));
        l.halos.forEach((h, i) => (h.opacity = i === state ? 0.55 + night * 0.3 : 0));
      });

      // 2 · portique : le véhicule est « scanné » en passant
      const dx = Math.abs(xc - PORTAL_X);
      const near = clamp01(1 - dx / 7);
      scanMat.opacity = near * 0.32;
      lineMat.opacity = near * 0.9;
      scanLine.position.y = 0.3 + 2.0 * (0.5 + 0.5 * Math.sin(xc * 1.6));
      carRig.bodyMat.emissive.set(near > 0.02 ? '#22D3EE' : '#1B3FA0');
      carRig.bodyMat.emissiveIntensity = near > 0.02 ? near * 0.45 : night * 0.12;

      // 3 · carte grise attachée au véhicule par un fil ; elle le quitte quand on passe à la flotte
      const tagVis = smooth((p - 0.35) / 0.05) * (1 - smooth((p - 0.83) / 0.07));
      const sway = Math.sin(xc * 0.35);
      tag.position.set(xc + 0.4 + sway * 0.18, 3.5 + Math.sin(xc * 0.5) * 0.1, CAR_Z + 0.4);
      tag.lookAt(camera.position);
      a.set(xc - 0.35, 1.5 + bob, CAR_Z);
      b.set(tag.position.x, tag.position.y - 0.56, tag.position.z);
      mid.copy(a).add(b).multiplyScalar(0.5);
      const len = a.distanceTo(b);
      tether.position.copy(mid);
      tether.scale.set(1, len, 1);
      q.setFromUnitVectors(up, dir.copy(b).sub(a).normalize());
      tether.quaternion.copy(q);
      tagMat.opacity = tagVis;
      tetherMat.opacity = tagVis;
      tag.visible = tagVis > 0.01;
      tether.visible = tagVis > 0.01;

      // 5 · un « + » monte au-dessus du véhicule à chaque course terminée
      pops.forEach((pp, i) => {
        const age = (xc - (POP_START + i * 11)) / 9;
        const on = age >= 0 && age <= 1;
        pp.s.visible = on;
        if (on) {
          pp.s.position.set(xc - 0.2 + i * 0.05, 2.6 + age * 2.3, CAR_Z + 0.3);
          pp.m.opacity = Math.sin(Math.min(1, age * 1.1) * Math.PI) ** 0.6;
          const sc = 0.7 + 0.5 * smooth(age / 0.3);
          pp.s.scale.set(sc, sc, sc);
        }
      });

      // 6 · la flotte grandit tout seule, ou suit les boutons « − » et « + »
      const k6 = stepWin(p, PARTNER_STEPS.length - 1, PARTNER_STEPS);
      const auto = p < PARTNER_STEPS[5][0] ? 1 : 1 + Math.round(smooth(k6.loc / 0.65) * 5);
      const n = p < PARTNER_STEPS[5][0] ? 1 : (fleetStore.userN ?? auto);
      fleetStore.setShown(n);
      const place = (mesh: THREE.InstancedMesh, list: { s: (typeof SLOTS)[number]; i: number }[]) => {
        list.forEach(({ s, i }, k) => {
          const visible = i < n && i > 0;
          dummy.position.set(xc + s.dx + Math.sin(xc * 0.03 + i) * 1.4, 0, s.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(visible ? 1 : 0.0001);
          dummy.updateMatrix();
          mesh.setMatrixAt(k, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
      };
      place(fleetCars, groups.car);
      place(fleetMotos, groups.moto);
      place(fleetTris, groups.tri);
      dummy.scale.setScalar(1);
      const t = performance.now() / 700;
      for (let i = 0; i < FLEET_MAX; i++) {
        const s = SLOTS[i];
        const show = i < n && p >= PARTNER_STEPS[5][0];
        dummy.position.set(xc + s.dx + (i > 0 ? Math.sin(xc * 0.03 + i) * 1.4 : 0), (s.t === 'moto' ? 2.5 : 2.9) + Math.sin(t + i) * 0.12, s.z);
        dummy.rotation.set(0, t + i, 0);
        dummy.scale.setScalar(show ? 1 : 0.0001);
        dummy.updateMatrix();
        markers.setMatrixAt(i, dummy.matrix);
      }
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      markers.instanceMatrix.needsUpdate = true;
      markMat.opacity = k6.v * 0.95;

      // Caméra : plan du chapitre, décalé par rapport au véhicule (plus loin sur un écran étroit)
      const c = camAt(p);
      const fr = frameFor(sizes.aspect, FOV);
      const kk = fr.kk;
      const look = new THREE.Vector3(xc + c.look[0] * kk, c.look[1], c.look[2]);
      const pos = new THREE.Vector3(xc + c.pos[0] * (0.4 + 0.6 * kk), c.pos[1], c.pos[2]);
      pos.sub(look).multiplyScalar(fr.zoom).add(look);
      if (Math.abs(camera.fov - fr.fov) > 0.01) {
        camera.fov = fr.fov;
        camera.updateProjectionMatrix();
      }
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

      updatePartnerHud(hud, p);
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
        <HudPanelsPartner />
      </svg>
    </div>
  );
}
