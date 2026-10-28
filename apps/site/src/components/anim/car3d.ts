import * as THREE from 'three';
import { mix } from './journey-shared';
import { canvasTexture, merged, type Track } from './world3d';

/**
 * Le véhicule TamCar : citadine blanche (type Toyota Yaris), avec le vrai logo sur les portières (fichier /logo.png déjà
 * présent sur le site), conducteur visible, phares, feux, faisceaux et ombre. Avant = +x ; l'origine est au sol, au centre.
 */
export type Car3D = {
  group: THREE.Group;
  /** Position du conducteur (pour le remplacer, le mettre en évidence…). */
  driver: THREE.Group;
  /** Roule : fait tourner les roues pour une position `xc` (m) ; `night` règle phares, feux et teintes. */
  update: (night: number, xc: number) => void;
  bodyMat: THREE.MeshPhysicalMaterial;
};

export function createCar(track: Track, maxAniso: number, cancelled: { v: boolean }): Car3D {
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
  const driver = new THREE.Group();
  const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.14, 14, 10)), darkMat);
  head.position.set(0.12, 1.2, -0.36);
  const torso = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.17, 0.26, 4, 10)), darkMat);
  torso.position.set(0.08, 0.94, -0.36);
  driver.add(head, torso);
  car.add(driver);
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

  // Livrée : le logo TamCar sur les portières
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

  const update = (night: number, xc: number) => {
    wheels.forEach((w) => (w.rotation.z = -xc / 0.31));
    headLampMat.emissiveIntensity = 0.3 + night * 3;
    tailMat.emissiveIntensity = 0.4 + night * 1.2;
    beamMat.opacity = night * 0.5;
    spots.forEach((s) => (s.intensity = night * 150));
    glassMat.color.set(mix('#27303D', '#161C28', night));
  };

  return { group: car, driver, update, bodyMat };
}
