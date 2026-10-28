import * as THREE from 'three';
import { smooth } from './journey-shared';
import { canvasTexture, type Track } from './world3d';
import { createPerson } from './people3d';

/**
 * Le bureau de la séquence 5 : un partenaire et un représentant de TamCar autour d'une table, un ordinateur, des
 * documents. Pièce fermée, éclairée par ses propres lumières ; placée très loin de la rue pour ne jamais la croiser.
 * Repère local : sol à y = 0, centre de la pièce en (0, 0), le fond est à z = -3.6, l'entrée de la caméra à z = +4.2.
 */

export const OFFICE_ORIGIN = new THREE.Vector3(4000, 0, 0);

const NAVY = '#0B1A3A';

export type Office = {
  group: THREE.Group;
  /** Gestes, écran de l'ordinateur : fonction du temps `t` du film. */
  update: (t: number) => void;
};

export function createOffice(track: Track, maxAniso: number, cancelled: { v: boolean }): Office {
  const group = new THREE.Group();
  group.position.copy(OFFICE_ORIGIN);
  const lam = (c: string, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => track(new THREE.MeshLambertMaterial({ color: c, ...extra }));
  const add = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    group.add(m);
    return m;
  };

  /* pièce : sol, murs, plafond */
  add(9.2, 0.1, 7.9, lam('#CBB69A'), 0, -0.05, 0.3);
  const wallMat = lam('#EEF2F8');
  add(9.2, 3.3, 0.1, wallMat, 0, 1.65, -3.65); // fond
  add(0.1, 3.3, 7.9, wallMat, -4.55, 1.65, 0.3);
  add(0.1, 3.3, 7.9, wallMat, 4.55, 1.65, 0.3);
  add(9.2, 3.3, 0.1, wallMat, 0, 1.65, 4.25); // derrière la caméra
  add(9.2, 0.1, 7.9, lam('#F7F9FC'), 0, 3.3, 0.3);
  add(9.0, 0.95, 0.04, lam(NAVY), 0, 0.48, -3.58); // soubassement bleu nuit
  add(0.04, 0.95, 7.7, lam(NAVY), -4.48, 0.48, 0.3);
  add(0.04, 0.95, 7.7, lam(NAVY), 4.48, 0.48, 0.3);
  // plafonniers
  const lightMat = track(new THREE.MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false }));
  [-1.8, 1.8].forEach((x) => add(1.6, 0.04, 0.46, lightMat, x, 3.24, -0.4));

  /* fenêtre sur la ville (fond) */
  const winTex = track(
    canvasTexture(512, 320, (g) => {
      const sky = g.createLinearGradient(0, 0, 0, 320);
      sky.addColorStop(0, '#7FB2E8');
      sky.addColorStop(1, '#F1E6CF');
      g.fillStyle = sky;
      g.fillRect(0, 0, 512, 320);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath();
      g.ellipse(120, 70, 60, 14, 0, 0, Math.PI * 2);
      g.ellipse(150, 62, 40, 12, 0, 0, Math.PI * 2);
      g.ellipse(390, 100, 52, 12, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#B7A68B';
      for (let i = 0; i < 12; i++) {
        const w = 28 + ((i * 37) % 30);
        const h = 40 + ((i * 53) % 70);
        g.fillRect(i * 44 - 6, 320 - h, w, h);
      }
      g.fillStyle = '#8F7A60';
      for (let i = 0; i < 9; i++) g.fillRect(i * 58 + 10, 320 - 30 - ((i * 29) % 40), 36, 40);
      g.strokeStyle = '#2F7A3B';
      g.lineWidth = 5;
      [90, 330, 470].forEach((x) => {
        g.beginPath();
        g.moveTo(x, 320);
        g.lineTo(x + 6, 236);
        g.stroke();
        for (let k = 0; k < 5; k++) {
          g.beginPath();
          g.moveTo(x + 6, 236);
          g.quadraticCurveTo(x + 6 + (k - 2) * 22, 214 - Math.abs(k - 2) * 4, x + 6 + (k - 2) * 34, 244 + Math.abs(k - 2) * 8);
          g.stroke();
        }
      });
    }),
  );
  const win = new THREE.Mesh(track(new THREE.PlaneGeometry(2.6, 1.6)), track(new THREE.MeshBasicMaterial({ map: winTex, toneMapped: false })));
  win.position.set(-2.5, 1.85, -3.58);
  group.add(win);
  const frameMat = lam('#FFFFFF');
  add(2.78, 0.09, 0.08, frameMat, -2.5, 2.69, -3.56);
  add(2.78, 0.09, 0.08, frameMat, -2.5, 1.01, -3.56);
  add(0.09, 1.78, 0.08, frameMat, -3.84, 1.85, -3.56);
  add(0.09, 1.78, 0.08, frameMat, -1.16, 1.85, -3.56);
  add(0.05, 1.6, 0.06, frameMat, -2.5, 1.85, -3.55);

  /* affiche TamCar */
  add(1.9, 1.3, 0.05, lam(NAVY), 2.4, 1.9, -3.58);
  const logoMat = track(new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, alphaTest: 0.02 }));
  new THREE.TextureLoader().load('/logo-blanc.png', (tex) => {
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
  const logo = new THREE.Mesh(track(new THREE.PlaneGeometry(1.2, 0.955)), logoMat);
  logo.position.set(2.4, 1.9, -3.545);
  group.add(logo);

  /* table, chaises */
  const wood = lam('#D9BE92');
  add(1.7, 0.06, 1.0, wood, 0, 0.74, -0.4);
  [
    [-0.78, -0.85],
    [0.78, -0.85],
    [-0.78, 0.05],
    [0.78, 0.05],
  ].forEach(([x, z]) => add(0.06, 0.72, 0.06, lam('#8A6B45'), x, 0.36, z));
  const chairMat = lam('#2B3A55');
  [-1.44, 1.44].forEach((x) => {
    add(0.5, 0.06, 0.5, chairMat, x, 0.43, -0.4);
    add(0.06, 0.55, 0.5, chairMat, x + (x < 0 ? -0.24 : 0.24), 0.72, -0.4);
    add(0.05, 0.4, 0.05, lam('#14181F'), x, 0.2, -0.4);
  });

  /* personnes */
  const partner = createPerson(track, { skin: '#6B4328', hair: '#15100C', shirt: '#BFD7F2', vest: null, trousers: '#2C3447' }, true);
  partner.group.position.set(-1.3, 0, -0.4);
  const rep = createPerson(track, { skin: '#8A5A3C', hair: '#15100C', shirt: '#FFFFFF', vest: NAVY, trousers: '#1B2438' }, true);
  rep.group.position.set(1.3, 0, -0.4);
  rep.group.rotation.y = Math.PI;
  group.add(partner.group, rep.group);

  /* ordinateur : l'écran montre un suivi de véhicule (carte + point qui avance) */
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 256;
  screenCanvas.height = 160;
  const sg = screenCanvas.getContext('2d')!;
  const screenTex = track(new THREE.CanvasTexture(screenCanvas));
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const route: [number, number][] = [
    [30, 128],
    [76, 118],
    [112, 96],
    [150, 98],
    [186, 70],
    [228, 56],
  ];
  const drawScreen = (k: number) => {
    sg.fillStyle = '#EEF3F9';
    sg.fillRect(0, 0, 256, 160);
    sg.fillStyle = NAVY;
    sg.fillRect(0, 0, 256, 20);
    sg.fillStyle = '#fff';
    sg.font = '700 11px system-ui, sans-serif';
    sg.fillText('TamCar · Suivi du véhicule', 8, 14);
    sg.fillStyle = '#CFE0F5';
    sg.fillRect(0, 20, 256, 140);
    sg.fillStyle = '#FFFFFF';
    [
      [10, 30, 70, 8],
      [60, 60, 8, 90],
      [140, 40, 8, 110],
      [180, 100, 70, 8],
      [20, 140, 200, 8],
    ].forEach(([x, y, w, h]) => sg.fillRect(x, y, w, h));
    sg.strokeStyle = '#2563EB';
    sg.lineWidth = 5;
    sg.lineJoin = 'round';
    sg.beginPath();
    route.forEach(([x, y], i) => (i ? sg.lineTo(x, y) : sg.moveTo(x, y)));
    sg.stroke();
    const f = k * (route.length - 1);
    const i = Math.min(route.length - 2, Math.floor(f));
    const u = f - i;
    const px = route[i][0] + (route[i + 1][0] - route[i][0]) * u;
    const py = route[i][1] + (route[i + 1][1] - route[i][1]) * u;
    sg.fillStyle = 'rgba(37,99,235,0.28)';
    sg.beginPath();
    sg.arc(px, py, 13, 0, Math.PI * 2);
    sg.fill();
    sg.fillStyle = '#2563EB';
    sg.beginPath();
    sg.arc(px, py, 6.5, 0, Math.PI * 2);
    sg.fill();
    sg.strokeStyle = '#fff';
    sg.lineWidth = 2.2;
    sg.stroke();
    screenTex.needsUpdate = true;
  };
  drawScreen(0);
  const laptop = new THREE.Group();
  laptop.position.set(0.02, 0.77, -0.38);
  laptop.rotation.y = 0.18;
  const lapMat = lam('#C7CDD6');
  const base = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.018, 0.25)), lapMat);
  const lid = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.23, 0.014)), lam('#9AA3B2'));
  lid.position.set(0, 0.12, -0.125);
  lid.rotation.x = -0.2;
  const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(0.33, 0.2)), track(new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })));
  screen.position.set(0, 0.12, -0.116);
  screen.rotation.x = -0.2;
  laptop.add(base, lid, screen);
  group.add(laptop);

  /* documents et chemise */
  const paperTex = track(
    canvasTexture(128, 180, (g) => {
      g.fillStyle = '#FFFFFF';
      g.fillRect(0, 0, 128, 180);
      g.fillStyle = NAVY;
      g.fillRect(10, 12, 60, 8);
      g.fillStyle = '#9AA3B2';
      for (let y = 34; y < 168; y += 12) g.fillRect(10, y, y % 24 ? 100 : 80, 4);
    }),
  );
  const paperMat = track(new THREE.MeshLambertMaterial({ map: paperTex }));
  [
    [-0.55, -0.18, 0.2],
    [-0.42, -0.5, -0.1],
    [0.55, -0.55, 0.12],
  ].forEach(([x, z, r]) => {
    const p = new THREE.Mesh(track(new THREE.BoxGeometry(0.21, 0.004, 0.3)), paperMat);
    p.position.set(x, 0.775, z);
    p.rotation.y = r;
    group.add(p);
  });
  add(0.26, 0.012, 0.34, lam(NAVY), 0.5, 0.78, -0.12, -0.15);
  add(0.07, 0.07, 0.07, lam('#FFFFFF'), 0.85, 0.8, -0.7); // tasse

  /* plante */
  add(0.5, 0.45, 0.5, lam('#8B93A1'), 3.6, 0.22, -2.8);
  const leaf = lam('#2F8A45');
  [0.55, 0.8, 1.05].forEach((y, i) => {
    const s = new THREE.Mesh(track(new THREE.SphereGeometry(0.42 - i * 0.07, 12, 9)), leaf);
    s.position.set(3.6 + (i - 1) * 0.12, 0.7 + y * 0.6, -2.8);
    group.add(s);
  });

  /* lumières de la pièce */
  const hemi = new THREE.HemisphereLight('#FFFFFF', '#B9A58A', 1.15);
  hemi.position.set(0, 3, 0);
  const key = new THREE.PointLight('#FFF1DC', 60, 18, 1.6);
  key.position.set(0, 2.9, 1.2);
  const fill = new THREE.PointLight('#DCEBFF', 28, 14, 1.6);
  fill.position.set(-2.6, 2.0, -2.4);
  group.add(hemi, key, fill);

  let lastScreen = -1;
  const update = (t: number) => {
    // l'écran avance par paliers de 1/12 s (pas besoin de plus)
    const k = Math.min(1, Math.max(0, (t - 27) / 7));
    const q = Math.round(k * 120);
    if (q !== lastScreen) {
      lastScreen = q;
      drawScreen(k);
    }
    // gestes : le représentant montre l'écran, le partenaire acquiesce
    const point = smooth(Math.min(1, Math.max(0, (t - 28.2) / 0.8))) * (1 - smooth(Math.min(1, Math.max(0, (t - 31.2) / 0.8))));
    rep.arms[0].rotation.z = 0.45 + point * 0.45 + Math.sin(t * 1.7) * 0.03 * point;
    rep.elbows[0].rotation.z = 1.0 - point * 0.25;
    rep.body.rotation.z = -point * 0.05;
    partner.body.rotation.z = Math.sin(t * 0.9) * 0.015 + (Math.sin(t * 2.2) > 0.9 ? 0.05 : 0);
    partner.elbows[1].rotation.z = 1.0 + Math.sin(t * 1.1) * 0.05;
  };

  return { group, update };
}
