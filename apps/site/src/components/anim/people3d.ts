import * as THREE from 'three';
import type { Track } from './world3d';

/**
 * Personnages simples (boîtes et sphères, sans visage) pour le film des partenaires : un chauffeur debout qui marche,
 * et des personnes assises au bureau. Avant = +x ; l'origine est au sol (debout) ou au niveau du sol sous le siège (assis).
 */

export type PersonStyle = {
  skin: string;
  hair: string;
  shirt: string;
  vest: string | null;
  trousers: string;
  shoes?: string;
};

export type Person = {
  group: THREE.Group;
  /** Le buste (pour pencher, saluer) et les deux bras (pivots d'épaule), pour les gestes. */
  body: THREE.Group;
  arms: THREE.Group[];
  elbows: THREE.Group[];
  mats: THREE.MeshLambertMaterial[];
  /** Fait marcher (phase en radians) ou reste à l'arrêt (amplitude 0). */
  pose: (phase: number, amp: number) => void;
  setOpacity: (o: number) => void;
};

function box(track: Track, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function createPerson(track: Track, s: PersonStyle, seated = false): Person {
  const mk = (c: string) => track(new THREE.MeshLambertMaterial({ color: c }));
  const skin = mk(s.skin);
  const hair = mk(s.hair);
  const shirt = mk(s.shirt);
  const vest = mk(s.vest ?? s.shirt);
  const trousers = mk(s.trousers);
  const shoes = mk(s.shoes ?? '#15171B');
  const mats = [skin, hair, shirt, vest, trousers, shoes];

  const group = new THREE.Group();
  const lift = seated ? 0.47 : 0.86; // hauteur des hanches
  const body = new THREE.Group();
  body.position.y = lift;
  group.add(body);

  // Buste : chemise + gilet (deux panneaux) ; épaules
  body.add(box(track, 0.26, 0.6, 0.42, shirt, 0, 0.3, 0));
  if (s.vest) {
    body.add(box(track, 0.285, 0.46, 0.43, vest, 0.0, 0.22, 0));
    body.add(box(track, 0.02, 0.2, 0.12, shirt, 0.14, 0.46, 0));
  }
  // Cou, tête, cheveux
  body.add(box(track, 0.09, 0.1, 0.09, skin, 0, 0.64, 0));
  const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.118, 14, 10)), skin);
  head.position.set(0.01, 0.78, 0);
  head.castShadow = true;
  body.add(head);
  const cap = new THREE.Mesh(track(new THREE.SphereGeometry(0.124, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), hair);
  cap.position.set(-0.012, 0.795, 0);
  body.add(cap);

  // Bras : pivot à l'épaule, puis au coude (avant-bras et main)
  const arms: THREE.Group[] = [];
  const elbows: THREE.Group[] = [];
  [0.26, -0.26].forEach((z) => {
    const a = new THREE.Group();
    a.position.set(0, 0.56, z);
    const upper = box(track, 0.1, 0.3, 0.1, shirt, 0, -0.15, 0);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.3, 0);
    elbow.add(box(track, 0.09, 0.28, 0.09, shirt, 0, -0.14, 0), box(track, 0.08, 0.09, 0.08, skin, 0, -0.33, 0));
    a.add(upper, elbow);
    body.add(a);
    arms.push(a);
    elbows.push(elbow);
  });

  // Jambes : debout (pivot à la hanche) ou assis (cuisse à l'horizontale, jambe qui descend)
  const legs: THREE.Group[] = [];
  [0.1, -0.1].forEach((z) => {
    const l = new THREE.Group();
    l.position.set(0, 0, z);
    if (seated) {
      l.add(box(track, 0.44, 0.15, 0.15, trousers, 0.22, 0, 0));
      l.add(box(track, 0.13, 0.4, 0.13, trousers, 0.44, -0.2, 0));
      l.add(box(track, 0.24, 0.07, 0.14, shoes, 0.52, -0.43, 0));
    } else {
      l.add(box(track, 0.14, 0.46, 0.14, trousers, 0, -0.23, 0));
      l.add(box(track, 0.13, 0.4, 0.13, trousers, 0, -0.64, 0));
      l.add(box(track, 0.25, 0.08, 0.14, shoes, 0.05, -0.83, 0));
    }
    body.add(l);
    legs.push(l);
  });

  if (seated) {
    // avant-bras posés sur la table
    arms.forEach((a) => (a.rotation.z = 0.45));
    elbows.forEach((e) => (e.rotation.z = 1.0));
  }

  const pose = (phase: number, amp: number) => {
    if (seated) return;
    const sw = Math.sin(phase) * amp;
    legs[0].rotation.z = sw * 0.62;
    legs[1].rotation.z = -sw * 0.62;
    arms[0].rotation.z = -sw * 0.5;
    arms[1].rotation.z = sw * 0.5;
    elbows.forEach((e) => (e.rotation.z = 0.15 + amp * 0.25));
    body.position.y = lift + Math.abs(Math.cos(phase)) * 0.025 * amp;
    body.rotation.z = amp * 0.03;
  };

  const setOpacity = (o: number) => {
    mats.forEach((m) => {
      m.transparent = o < 0.999;
      m.opacity = o;
    });
  };

  return { group, body, arms, elbows, mats, pose, setOpacity };
}
