import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SKY_BOT, SKY_TOP, lerp, mix } from './journey-shared';

/**
 * Le décor commun des routes 3D (Clients, Partenaires) : un Cotonou / Porto-Novo imaginé d'après des photos de
 * référence. Maisons basses ocre, toits en tôle, terre rouge, palmiers, kiosques, parasols, personnages, motos garées,
 * circulation en sens inverse, poteaux et fils, lampadaires orangés, lumière du jour poussiéreux → nuit.
 * Tout est dessiné par le code (aucun fichier de modèle ni d'image).
 */

export type Disposable = { dispose: () => void };
export type Track = <T extends Disposable>(o: T) => T;

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Ajoute un attribut `color` uniforme (r, g, b en 0-1) à une géométrie et la rend non indexée (fusion possible). */
export function paint(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = ng.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

export function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return m;
}

/** Moto-taxi (zémidjan) : cadre jaune et bleu, conducteur en haut jaune et casque bleu. Avant = +x. */
export function buildMoto(rider: boolean): THREE.BufferGeometry {
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
}

/** Tricycle passagers (« kéké » / kloboto) : roue avant, deux roues arrière, cabine ouverte sous un toit. Avant = +x. */
export function buildTricycle(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    paint(new THREE.CylinderGeometry(0.3, 0.3, 0.13, 12).rotateX(Math.PI / 2).translate(1.25, 0.3, 0), '#15171B'),
    paint(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 12).rotateX(Math.PI / 2).translate(-0.7, 0.34, 0.66), '#15171B'),
    paint(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 12).rotateX(Math.PI / 2).translate(-0.7, 0.34, -0.66), '#15171B'),
    paint(new THREE.BoxGeometry(2.5, 0.12, 0.95).translate(0.05, 0.48, 0), '#1B1D22'),
    paint(new THREE.BoxGeometry(1.5, 0.55, 1.0).translate(-0.35, 0.82, 0), '#F4C20D'),
    paint(new THREE.BoxGeometry(0.9, 0.5, 0.6).translate(0.95, 0.78, 0), '#1E57B8'),
    paint(new THREE.BoxGeometry(0.08, 1.0, 0.08).translate(0.5, 1.4, 0.45), '#9AA1AE'),
    paint(new THREE.BoxGeometry(0.08, 1.0, 0.08).translate(0.5, 1.4, -0.45), '#9AA1AE'),
    paint(new THREE.BoxGeometry(0.08, 1.0, 0.08).translate(-1.05, 1.4, 0.45), '#9AA1AE'),
    paint(new THREE.BoxGeometry(0.08, 1.0, 0.08).translate(-1.05, 1.4, -0.45), '#9AA1AE'),
    paint(new THREE.BoxGeometry(2.0, 0.07, 1.15).translate(-0.28, 1.93, 0), '#F4F5F7'),
    paint(new THREE.BoxGeometry(0.5, 0.35, 0.8).translate(-0.7, 1.15, 0), '#2A3440'),
    paint(new THREE.BoxGeometry(0.06, 0.06, 0.6).translate(1.05, 1.12, 0), '#1B1D22'),
    paint(new THREE.SphereGeometry(0.14, 10, 8).translate(0.72, 1.42, 0), '#2B2F36'),
    paint(new THREE.BoxGeometry(0.26, 0.5, 0.36).translate(0.7, 1.1, 0), '#F5C518'),
  ];
  return merged(parts);
}

/** Voiture simplifiée (boîte blanche, vitres sombres, quatre roues) pour la circulation et les flottes. Avant = +x. */
export function buildSimpleCar(): THREE.BufferGeometry {
  return merged([
    paint(new THREE.BoxGeometry(3.7, 0.7, 1.6).translate(0, 0.62, 0), '#ffffff'),
    paint(new THREE.BoxGeometry(2.0, 0.6, 1.42).translate(-0.2, 1.22, 0), '#2A3440'),
    paint(new THREE.BoxGeometry(1.7, 0.06, 1.46).translate(-0.2, 1.55, 0), '#ffffff'),
    paint(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10).rotateX(Math.PI / 2).translate(1.2, 0.3, 0.7), '#15171B'),
    paint(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10).rotateX(Math.PI / 2).translate(1.2, 0.3, -0.7), '#15171B'),
    paint(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10).rotateX(Math.PI / 2).translate(-1.2, 0.3, 0.7), '#15171B'),
    paint(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10).rotateX(Math.PI / 2).translate(-1.2, 0.3, -0.7), '#15171B'),
  ]);
}

export type World = {
  /** Groupe qui contient tout le décor (rue, maisons, lampadaires, lumières) : `root.visible = false` le masque. */
  root: THREE.Group;
  /**
   * Met à jour lumières, couleurs, circulation et ciel : `night` 0 (jour) → 1 (nuit), `xc` position du véhicule suivi.
   * `traffic` (par défaut `xc`) fait avancer la circulation en sens inverse indépendamment du véhicule (film : il peut s'arrêter).
   */
  update: (night: number, xc: number, traffic?: number) => void;
  /** À appeler quand la taille (ou le rapport largeur/hauteur) de la zone change. */
  layout: (aspect: number) => void;
  /** Matière des poteaux (panneaux, affiches). */
  poleMat: THREE.Material;
  /** Une matière « sans lumière » (panneaux, affiches) qui s'assombrit la nuit. */
  dimmed: (m: THREE.MeshBasicMaterial) => void;
  /** Panneau publicitaire au bord de la route (face vers la caméra). */
  addAd: (x: number, tex: THREE.Texture, y?: number) => void;
};

export function createWorld(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  track: Track,
  o: { x0: number; x1: number },
): World {
  const { x0: X0, x1: X1 } = o;
  const SPAN = X1 - X0 + 260;
  const dummy = new THREE.Object3D();
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const dimTargets: THREE.MeshBasicMaterial[] = [];
  // Tout le décor est rangé dans un groupe : on peut le masquer d'un coup (scène d'intérieur du film des partenaires)
  const root = new THREE.Group();
  scene.add(root);

  scene.fog = new THREE.Fog('#E9D9BF', 26, 175);

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
  root.add(hemi);
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
  root.add(sunLight, sunLight.target);

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
  ground.position.set((X0 + X1) / 2, -0.02, -150);
  ground.receiveShadow = true;
  root.add(ground);

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
  root.add(road);

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
    root.add(m);
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
  root.add(dashes);
  const edgeGeo = track(new THREE.BoxGeometry(X1 - X0, 0.02, 0.12));
  [-3.2, 3.2].forEach((z) => {
    const e = new THREE.Mesh(edgeGeo, lineMat);
    e.position.set((X0 + X1) / 2, 0.02, z);
    root.add(e);
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
  root.add(city);
  const roofMat = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const roofs = new THREE.Mesh(track(merged(roofParts)), roofMat);
  roofs.castShadow = true;
  root.add(roofs);
  const awningMat = track(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  root.add(new THREE.Mesh(track(merged(awningParts)), awningMat));
  const signMat = track(new THREE.MeshBasicMaterial({ map: signAtlas, color: '#ffffff', toneMapped: false }));
  dimTargets.push(signMat);
  root.add(new THREE.Mesh(track(merged(signParts)), signMat));

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
  root.add(kiosks);

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
  root.add(parasols);

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
  root.add(bodies, heads);

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
  root.add(parked);

  // Circulation en sens inverse : zémidjans et voitures, au rythme du défilement
  const ZEM_N = 26;
  const zems = new THREE.InstancedMesh(track(buildMoto(true)), motoMat, ZEM_N);
  const carBodyGeo = track(buildSimpleCar());
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
  root.add(zems, ocars, onLights);

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
  root.add(palms);

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
  root.add(woodPoles, crossArms);
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
  root.add(new THREE.LineSegments(wireGeo, wireMat));

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
  root.add(poles, arms, heads2, halos, pools);

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
  const skySize = { halfH: 1, halfW: 2 };

  const layout = (aspect: number) => {
    const dz = 95;
    skySize.halfH = dz * Math.tan((camera.fov / 2) * (Math.PI / 180));
    skySize.halfW = skySize.halfH * aspect;
    sky.position.set(0, 0, -dz);
    for (let i = 0; i < 260; i++) starPos.set([(starRnd() * 2 - 1) * skySize.halfW, (starRnd() * 1.2 - 0.2) * skySize.halfH, 0], i * 3);
    starGeo.attributes.position.needsUpdate = true;
  };

  /* ------------------------------------------------------------------ mise à jour */
  const update = (night: number, xc: number, traffic = xc) => {
    // Circulation en sens inverse : leur position dépend du trajet parcouru
    oncZ.forEach((on, i) => {
      const x = X0 + ((((on.x0 - on.speed * traffic) % SPAN) + SPAN) % SPAN);
      dummy.position.set(x, 0, on.z);
      dummy.rotation.set(0, Math.PI, 0);
      dummy.updateMatrix();
      zems.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x - 0.75, 0.62, on.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      onLights.setMatrixAt(i, dummy.matrix);
    });
    oncC.forEach((on, i) => {
      const x = X0 + ((((on.x0 - on.speed * traffic) % SPAN) + SPAN) % SPAN);
      dummy.position.set(x, 0, on.z);
      dummy.rotation.set(0, Math.PI, 0);
      dummy.updateMatrix();
      ocars.setMatrixAt(i, dummy.matrix);
      [0.55, -0.55].forEach((dz, k) => {
        dummy.position.set(x - 1.86, 0.62, on.z - dz);
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
    (scene.fog as THREE.Fog).color.set(mix(SKY_BOT[0], SKY_BOT[1], night));
    groundMat.color.set(mix('#E6D3C0', '#2A2530', night));
    roadMat.color.set(mix('#EDEDED', '#2A2F3A', night));
    curbMat.color.set(mix('#FFFFFF', '#3A3E4A', night));
    lineMat.color.set(mix('#EDEDED', '#7B8396', night));
    wallMat.emissiveIntensity = night * 1.3;
    headMat.color.set(mix('#94A3B8', '#FFC97A', night));
    haloMat.opacity = night * 0.45;
    poolMat.opacity = night * 0.6;
    onLightsMat.opacity = night;
    const dim = mix('#FFFFFF', '#8C94A8', night);
    dimTargets.forEach((m) => m.color.set(dim));
    starMat.opacity = night * 0.9;

    // Astres : le soleil (voilé) se couche, la lune se lève
    sun.position.set(skySize.halfW * 0.72, lerp(skySize.halfH * 0.55, -skySize.halfH * 0.25, night), 0);
    moon.position.set(skySize.halfW * 0.72, lerp(-skySize.halfH * 0.3, skySize.halfH * 0.55, night), 0);
    sunMat.opacity = (1 - night) * 0.9;
    sunHaloMat.opacity = 0.3 * (1 - night);
    moonMat.opacity = night;
  };

  const addAd = (x: number, tex: THREE.Texture, y = 5.4) => {
    const m = track(new THREE.MeshBasicMaterial({ map: tex, color: '#ffffff', toneMapped: false }));
    dimTargets.push(m);
    const panel = new THREE.Mesh(track(new THREE.PlaneGeometry(6, 3)), m);
    panel.position.set(x, y, -8.3);
    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(6.2, 3.2, 0.12)), poleMat);
    frame.position.set(x, y, -8.4);
    [-2, 2].forEach((dx) => {
      const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.09, y - 1.4, 8)), poleMat);
      post.position.set(x + dx, (y - 1.4) / 2, -8.5);
      root.add(post);
    });
    root.add(frame, panel);
  };

  return {
    root,
    update,
    layout,
    poleMat,
    dimmed: (m) => {
      dimTargets.push(m);
    },
    addAd,
  };
}

/** Couleurs du ciel (haut et horizon) pour une part de nuit donnée, en CSS. */
export function skyColors(night: number) {
  return { top: mix(SKY_TOP[0], SKY_TOP[1], night), bottom: mix(SKY_BOT[0], SKY_BOT[1], night) };
}
