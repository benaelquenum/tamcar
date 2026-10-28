'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { clamp01, lerp, smooth } from './journey-shared';
import { buildSimpleCar, canvasTexture, createWorld, skyColors, type Disposable } from './world3d';
import { createCar } from './car3d';
import { createPerson } from './people3d';
import { OFFICE_ORIGIN, createOffice } from './office3d';
import { BAY_X, BAY_Z, T_BOARD, T_BOARDED, carX, carYaw, carZ, filmNight, pulse, rise, walkerAt } from './film-timeline';

/**
 * La scène 3D du film des partenaires (« Votre véhicule. Notre organisation. ») : la même ville que les routes Clients et
 * Partenaires, vue d'abord du ciel, puis au niveau de la rue (emplacement, chauffeur), un bureau pour la séquence 5, et
 * le retour à la ville. Tout est une fonction du temps `t` : `draw(t)` dessine et renvoie les points d'ancrage (écran)
 * des éléments d'interface qui accompagnent la scène (icônes, carte du chauffeur, étiquette).
 */

const X0 = -80;
const X1 = BAY_X + 300;
const FOV = 40;
const OFFICE_FROM = 24.3; // la scène change de lieu derrière le tableau de suivi
const OFFICE_TO = 33.9;

export type AnchorPoint = { x: number; y: number; ok: boolean };
export type FilmAnchors = { w: number; h: number; car: AnchorPoint; tag: AnchorPoint; icons: AnchorPoint[]; driver: AnchorPoint };
export type FilmDraw = (t: number) => FilmAnchors;

type V3 = [number, number, number];
type Key = { t: number; pos: V3; look: V3 };

/** Plans de caméra dans la rue : décalage en x par rapport au véhicule, hauteur et z absolus. */
const STREET: Key[] = [
  { t: 0, pos: [-30, 50, 40], look: [7, 0, 1.5] },
  { t: 3, pos: [-24, 30, 28], look: [7, 0.5, 2] },
  { t: 6, pos: [-14, 11, 18], look: [4, 0.8, 3.2] },
  { t: 8, pos: [-8, 5.2, 14.5], look: [1.2, 1.1, 4.8] },
  { t: 10.5, pos: [-5.6, 3.7, 14.2], look: [0.2, 1.1, 5.2] },
  { t: 12.5, pos: [-7.0, 3.3, 13.6], look: [-1.6, 1.1, 5.6] },
  { t: 15.5, pos: [-4.8, 3.0, 12.8], look: [-0.6, 1.1, 5.6] },
  { t: 18, pos: [-9, 3.8, 13.5], look: [3, 1.1, 4.5] },
  { t: 21, pos: [-16, 9, 20], look: [5, 0.8, 3.2] },
  { t: 24, pos: [-24, 16, 26], look: [7, 0.6, 2.6] },
  { t: 34, pos: [-15, 4.6, 13.5], look: [6.5, 1.3, 2.2] },
  { t: 38, pos: [-19, 6.2, 17], look: [7, 1.2, 2.2] },
  { t: 42, pos: [-21, 7.4, 19], look: [8, 1.2, 2.2] },
];
/** Plans de caméra du bureau (repère de la pièce). */
const OFFICE: Key[] = [
  { t: 24, pos: [-1.9, 1.55, 3.7], look: [-0.2, 1.0, -0.4] },
  { t: 29, pos: [0.1, 1.5, 3.2], look: [0.0, 1.02, -0.4] },
  { t: 34, pos: [1.5, 1.45, 3.0], look: [0.1, 1.0, -0.4] },
];

/** Interpolation d'Hermite à vitesse continue entre les plans (pas d'à-coup aux changements de plan). */
function along(keys: Key[], t: number, f: 'pos' | 'look'): V3 {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(keys.length - 1, i + 2)];
  const dt = k2.t - k1.t;
  const u = clamp01((t - k1.t) / dt);
  const u2 = u * u;
  const u3 = u2 * u;
  const out: V3 = [0, 0, 0];
  for (let n = 0; n < 3; n++) {
    const p1 = k1[f][n];
    const p2 = k2[f][n];
    const m1 = ((p2 - k0[f][n]) / (k2.t - k0.t)) * dt;
    const m2 = ((k3[f][n] - p1) / (k3.t - k1.t)) * dt;
    out[n] = (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
  }
  return out;
}

// circulation du film : voie sud, même sens que le véhicule (x au départ, vitesse, bleue ou non)
const TRAFFIC: { x: number; v: number; blue: boolean }[] = [
  { x: 36, v: 6.6, blue: false },
  { x: 96, v: 7.4, blue: true },
  { x: 150, v: 6.2, blue: false },
  { x: -18, v: 8.0, blue: true },
  { x: -64, v: 7.0, blue: false },
  { x: 205, v: 7.6, blue: false },
  { x: 262, v: 6.8, blue: true },
  { x: 118, v: 5.8, blue: false },
];
const TRAFFIC_Z = 0.4;
const TRAFFIC_SPAN = X1 - X0;

/** Rectangle à coins arrondis (le repli évite `roundRect`, absent des navigateurs un peu anciens). */
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export default function FilmScene3D({ registerDraw, onFail, onResize }: { registerDraw: (fn: FilmDraw | null) => void; onFail: () => void; onResize: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const resizeRef = useRef(onResize);
  resizeRef.current = onResize;
  const regRef = useRef(registerDraw);
  regRef.current = registerDraw;

  useEffect(() => {
    const host = hostRef.current;
    const bg = bgRef.current;
    if (!host || !bg) return;

    const small = window.innerWidth < 760 || window.matchMedia('(pointer: coarse)').matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 2, alpha: true, powerPreference: 'high-performance' });
    } catch {
      failRef.current();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !small; // version allégée : pas d'ombres portées sur téléphone
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
    const camera = new THREE.PerspectiveCamera(FOV, 2, 0.1, 900);
    scene.add(camera);
    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

    const world = createWorld(scene, camera, renderer, track, { x0: X0, x1: X1 });
    // vue du ciel : on voit plus loin que dans les routes au ras du sol
    (scene.fog as THREE.Fog).near = 34;
    (scene.fog as THREE.Fog).far = 240;

    /* tout ce qui appartient à la rue (hors décor) est rangé ensemble : on le masque pour la scène du bureau */
    const street = new THREE.Group();
    scene.add(street);

    const carRig = createCar(track, maxAniso, cancelled);
    street.add(carRig.group);
    carRig.driver.visible = false;

    /* ------------------------------------------------------------------ circulation bleue et blanche */
    const trafficMat = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const traffic = new THREE.InstancedMesh(track(buildSimpleCar()), trafficMat, TRAFFIC.length);
    TRAFFIC.forEach((c, i) => traffic.setColorAt(i, new THREE.Color(c.blue ? '#2B5FD0' : '#F4F5F7')));
    traffic.frustumCulled = false;
    traffic.castShadow = true;
    street.add(traffic);

    /* ------------------------------------------------------------------ l'emplacement : propre, bien éclairé */
    const padTex = track(
      canvasTexture(512, 256, (g) => {
        g.fillStyle = '#12306F';
        rr(g, 8, 8, 496, 240, 22);
        g.fill();
        g.strokeStyle = '#FFFFFF';
        g.lineWidth = 8;
        rr(g, 22, 22, 468, 212, 14);
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.92)';
        g.font = '800 62px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TamCar', 256, 128);
        g.fillStyle = '#22D3EE';
        g.fillRect(190, 168, 132, 6);
      }),
    );
    padTex.anisotropy = maxAniso;
    const pad = new THREE.Mesh(
      track(new THREE.PlaneGeometry(6.4, 3.2)),
      track(new THREE.MeshBasicMaterial({ map: padTex, transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 })),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(BAY_X, 0.03, BAY_Z);
    street.add(pad);

    const poolTex = track(
      canvasTexture(128, 128, (g) => {
        const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        r.addColorStop(0, 'rgba(255,248,225,0.95)');
        r.addColorStop(1, 'rgba(255,248,225,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 128, 128);
      }),
    );
    const poolMat = track(new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(11, 7.5)), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(BAY_X, 0.06, BAY_Z);
    street.add(pool);

    const poleMat = world.poleMat;
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.07, 0.1, 6.8, 8)), poleMat);
    pole.position.set(BAY_X + 4.3, 3.4, BAY_Z + 1.9);
    const arm = new THREE.Mesh(track(new THREE.BoxGeometry(2.7, 0.08, 0.08)), poleMat);
    arm.position.set(BAY_X + 2.95, 6.78, BAY_Z + 1.9);
    const headLamp = new THREE.Mesh(track(new THREE.BoxGeometry(0.7, 0.12, 0.4)), track(new THREE.MeshBasicMaterial({ color: '#FFF8E1', toneMapped: false })));
    headLamp.position.set(BAY_X + 1.7, 6.7, BAY_Z + 1.9);
    street.add(pole, arm, headLamp);
    const coneAlpha = track(
      canvasTexture(
        4,
        128,
        (g) => {
          const r = g.createLinearGradient(0, 0, 0, 128);
          r.addColorStop(0, '#fff');
          r.addColorStop(1, '#3a3a3a');
          g.fillStyle = r;
          g.fillRect(0, 0, 4, 128);
        },
        false,
      ),
    );
    const coneMat = track(
      new THREE.MeshBasicMaterial({ color: '#FFF3C4', transparent: true, opacity: 0, alphaMap: coneAlpha, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }),
    );
    const cone = new THREE.Mesh(track(new THREE.ConeGeometry(3.3, 6.7, 28, 1, true)), coneMat);
    cone.position.set(BAY_X + 1.7, 3.35, BAY_Z + 1.9);
    cone.scale.set(1, 1, 1);
    street.add(cone);
    // panneau « TamCar » sur le mât, face à la rue
    const signTex = track(
      canvasTexture(256, 128, (g) => {
        g.fillStyle = '#12306F';
        g.fillRect(0, 0, 256, 128);
        g.strokeStyle = '#fff';
        g.lineWidth = 6;
        g.strokeRect(6, 6, 244, 116);
        g.fillStyle = '#fff';
        g.font = '800 44px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TamCar', 128, 56);
        g.font = '700 22px system-ui, sans-serif';
        g.fillStyle = '#22D3EE';
        g.fillText('PARTENAIRES', 128, 98);
      }),
    );
    const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(1.5, 0.75)), track(new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false })));
    sign.position.set(BAY_X + 4.3, 3.7, BAY_Z + 2.04);
    street.add(sign);

    /* ------------------------------------------------------------------ séquence 1 : le véhicule se distingue */
    const ringMat = track(new THREE.MeshBasicMaterial({ color: '#22D3EE', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide }));
    const ring = new THREE.Mesh(track(new THREE.RingGeometry(2.5, 2.85, 48)), ringMat);
    ring.rotation.x = -Math.PI / 2;
    street.add(ring);
    const beaconMat = track(new THREE.MeshBasicMaterial({ color: '#22D3EE', transparent: true, opacity: 0, fog: false, toneMapped: false }));
    const beacon = new THREE.Mesh(track(new THREE.ConeGeometry(0.42, 0.9, 4).rotateX(Math.PI)), beaconMat);
    street.add(beacon);

    /* ------------------------------------------------------------------ séquence 3 : le chauffeur */
    const walker = createPerson(track, { skin: '#7A4B2F', hair: '#14100C', shirt: '#FFFFFF', vest: '#0B1A3A', trousers: '#1B2438' }, false);
    walker.group.visible = false;
    street.add(walker.group);

    /* ------------------------------------------------------------------ séquence 5 : le bureau */
    const office = createOffice(track, maxAniso, cancelled);
    scene.add(office.group);
    office.group.visible = false;

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
      // Le bas de l'image porte le texte : on remonte la scène (le véhicule reste au-dessus du bandeau de texte)
      camera.setViewOffset(w, h, 0, Math.round(h * (sizes.aspect < 1.2 ? 0.17 : 0.15)), w, h);
      camera.updateProjectionMatrix();
      world.layout(sizes.aspect);
    };

    const horizon = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const v = new THREE.Vector3();
    const look = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const proj = (x: number, y: number, z: number): AnchorPoint => {
      v.set(x, y, z).project(camera);
      return { x: (v.x * 0.5 + 0.5) * sizes.w, y: (-v.y * 0.5 + 0.5) * sizes.h, ok: v.z < 1 && v.z > -1 };
    };

    const draw: FilmDraw = (t) => {
      const night = filmNight(t);
      const inOffice = t >= OFFICE_FROM && t < OFFICE_TO;
      const cx = carX(t);
      const cz = carZ(t);

      world.root.visible = !inOffice;
      street.visible = !inOffice;
      office.group.visible = inOffice;

      if (!inOffice) {
        world.update(night, cx, t * 9);

        // le véhicule TamCar
        carRig.group.position.set(cx, 0, cz);
        carRig.group.rotation.y = carYaw(t);
        carRig.update(night, cx);
        carRig.driver.visible = t >= T_BOARD + 0.35;

        // circulation bleue et blanche
        TRAFFIC.forEach((c, i) => {
          const x = X0 + ((((c.x - X0 + c.v * t) % TRAFFIC_SPAN) + TRAFFIC_SPAN) % TRAFFIC_SPAN);
          dummy.position.set(x, 0, TRAFFIC_Z);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          traffic.setMatrixAt(i, dummy.matrix);
        });
        traffic.instanceMatrix.needsUpdate = true;

        // l'emplacement s'éclaire quand le véhicule arrive
        const lit = rise(t, 5.4, 8.0);
        poolMat.opacity = lit * 0.55;
        coneMat.opacity = lit * 0.14;

        // séquence 1 : l'anneau et la balise qui distinguent le véhicule TamCar
        const mark = pulse(t, 1.0, 2.6, 5.2, 6.8);
        ring.position.set(cx, 0.05, cz);
        const beat = (t * 0.9) % 1;
        ring.scale.setScalar(1 + beat * 0.5);
        ringMat.opacity = mark * (1 - beat) * 0.85;
        ring.visible = mark > 0.01;
        beacon.position.set(cx, 3.4 + Math.sin(t * 3) * 0.1, cz);
        beacon.rotation.y = t * 1.6;
        beaconMat.opacity = mark * 0.95;
        beacon.visible = mark > 0.01;

        // séquence 3 : le chauffeur arrive, attend, monte
        const w = walkerAt(t);
        walker.group.visible = w.visible;
        if (w.visible) {
          const boarding = clamp01((t - T_BOARD) / (T_BOARDED - T_BOARD));
          walker.group.position.set(w.x, 0, lerp(w.z, BAY_Z + 0.3, smooth(boarding)));
          walker.group.rotation.y = -w.face;
          walker.pose(w.phase, w.walking ? 1 : 0);
          walker.setOpacity(1 - smooth(boarding));
        }
      } else {
        world.update(0, cx, t * 9); // garde le décor cohérent s'il revient tout de suite
      }
      office.update(t);

      // Caméra
      const aspect = sizes.aspect;
      const narrow = clamp01((1.15 - aspect) * 1.1);
      if (inOffice) {
        const p = along(OFFICE, t, 'pos');
        const l = along(OFFICE, t, 'look');
        look.set(l[0], l[1], l[2]).add(OFFICE_ORIGIN);
        pos.set(p[0], p[1], p[2]).add(OFFICE_ORIGIN);
        const fov = FOV + narrow * 26;
        if (Math.abs(camera.fov - fov) > 0.01) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
      } else {
        const p = along(STREET, t, 'pos');
        const l = along(STREET, t, 'look');
        const kk = Math.max(0.2, Math.min(1, aspect / 1.3));
        look.set(cx + l[0] * kk, l[1], l[2]);
        pos.set(cx + p[0] * (0.4 + 0.6 * kk), p[1], p[2]);
        pos.sub(look).multiplyScalar(1 + narrow * 0.85).add(look);
        if (Math.abs(camera.fov - FOV) > 0.01) {
          camera.fov = FOV;
          camera.updateProjectionMatrix();
        }
      }
      camera.position.copy(pos);
      camera.lookAt(look);
      camera.updateMatrixWorld();

      // « la scène s'éclaircit légèrement » à la fin
      if (!inOffice) renderer.toneMappingExposure += 0.12 * rise(t, 34, 38);

      // Le ciel (dégradé CSS derrière le canvas transparent) s'aligne sur l'horizon
      const sky = skyColors(night);
      camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      horizon.copy(camera.position).addScaledVector(dir, 2000).project(camera);
      const yH = Math.min(96, Math.max(4, ((1 - horizon.y) / 2) * 100));
      bg.style.background = `linear-gradient(to bottom, ${sky.top} 0%, ${sky.bottom} ${yH}%, ${sky.bottom} 100%)`;

      renderer.render(scene, camera);

      // Points d'ancrage de l'interface (écran), seulement dans la rue
      const wk = walkerAt(t);
      return {
        w: sizes.w,
        h: sizes.h,
        car: proj(cx, 1.0, cz),
        tag: proj(cx, 2.25, cz),
        icons: [proj(BAY_X - 3.1, 2.2, BAY_Z + 0.2), proj(BAY_X + 0.2, 3.9, BAY_Z), proj(BAY_X + 3.2, 2.2, BAY_Z + 0.2)],
        driver: proj(wk.x, 1.95, lerp(wk.z, BAY_Z + 0.3, smooth(clamp01((t - T_BOARD) / (T_BOARDED - T_BOARD))))),
      };
    };

    layout();
    regRef.current(draw);
    const ro = new ResizeObserver(() => {
      layout();
      resizeRef.current();
    });
    ro.observe(host);

    return () => {
      cancelled.v = true;
      regRef.current(null);
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
    </div>
  );
}
