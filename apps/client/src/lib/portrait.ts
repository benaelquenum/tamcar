// Traitement automatique des photos d'identité des chauffeurs, dans le navigateur (le téléphone ou
// l'ordinateur du secrétariat) : rien n'est envoyé à un service tiers, seul le résultat final est
// chargé dans l'app.
//
//   1. lecture (orientation EXIF respectée) ;
//   2. détection du visage (MediaPipe, modèle chargé à la demande) ;
//   3. contrôles : un seul visage, cadrage, de face, éclairage, netteté, résolution ;
//   4. corrections : recadrage carré centré sur le visage, tête redressée, éclaircissement léger si
//      contre-jour (sans jamais « délaver » une peau foncée) ;
//   5. export JPEG 800 × 800, métadonnées (lieu, appareil) supprimées.

import type { FaceDetector } from '@mediapipe/tasks-vision';
import {
  backgroundLuma,
  backlightGamma,
  cropSquare,
  gammaLut,
  grayCrop,
  headPose,
  judge,
  laplacianVariance,
  meanLumaRect,
  type PortraitIssue,
  type PortraitMetrics,
} from './portraitMath';

export type { PortraitIssue } from './portraitMath';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

const OUT = 800;
const ANALYSIS_MAX = 1280;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

export type PortraitResult = {
  ok: boolean;
  issues: PortraitIssue[];
  blob: Blob | null;
  previewUrl: string | null;
  bytes: number;
};

let detectorPromise: Promise<FaceDetector> | null = null;

async function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FilesetResolver, FaceDetector: Detector } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return Detector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      });
    })().catch((e) => {
      detectorPromise = null; // on pourra réessayer
      throw e;
    });
  }
  return detectorPromise;
}

/** Précharge le détecteur (appelé à l'ouverture de l'outil, pour que la 1re photo soit rapide). */
export function warmUpPortraitDetector(): void {
  void getDetector().catch(() => undefined);
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode(); // l'orientation EXIF est appliquée par le navigateur
    return img;
  } finally {
    // l'URL doit rester valide le temps du dessin : on la libère après décodage de l'image
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

const fail = (message: string): PortraitResult => ({
  ok: false,
  issues: [{ code: 'input', level: 'error', message }],
  blob: null,
  previewUrl: null,
  bytes: 0,
});

export async function processPortrait(file: File): Promise<PortraitResult> {
  if (!file.type.startsWith('image/')) return fail('Ce fichier n’est pas une image.');
  if (file.size > MAX_INPUT_BYTES) return fail('Photo trop lourde (30 Mo maximum).');

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return fail('Image illisible. Si elle vient d’un iPhone, réglez l’appareil photo sur « Le plus compatible » (JPEG).');
  }
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (!W || !H) return fail('Image vide.');

  // --- 1. Image d'analyse (réduite) -------------------------------------------------------------
  const scale = Math.min(1, ANALYSIS_MAX / Math.max(W, H));
  const aw = Math.round(W * scale);
  const ah = Math.round(H * scale);
  const analysis = document.createElement('canvas');
  analysis.width = aw;
  analysis.height = ah;
  const actx = analysis.getContext('2d', { willReadFrequently: true });
  if (!actx) return fail('Le navigateur ne permet pas le traitement d’image.');
  actx.drawImage(img, 0, 0, aw, ah);

  // --- 2. Détection du visage -------------------------------------------------------------------
  let detections;
  try {
    const detector = await getDetector();
    detections = detector.detect(analysis).detections;
  } catch {
    return fail('Détection du visage indisponible (connexion Internet nécessaire la première fois). Réessayez.');
  }

  if (detections.length !== 1) {
    const issues = judge({
      faces: detections.length,
      faceHeightRatio: 0,
      yawRatio: 0,
      rollDeg: 0,
      faceLuma: 0,
      bgLuma: 0,
      sharpness: 0,
      cropSidePx: 0,
    });
    return { ok: false, issues, blob: null, previewUrl: null, bytes: 0 };
  }

  const det = detections[0];
  const bb = det.boundingBox;
  if (!bb) return fail('Visage détecté sans position exploitable.');
  const kp = det.keypoints ?? [];
  // Points BlazeFace : 0-1 yeux, 2 bout du nez, 3 bouche, 4-5 oreilles (coordonnées normalisées)
  const eyeA = kp[0] ? { x: kp[0].x * aw, y: kp[0].y * ah } : { x: bb.originX + bb.width * 0.3, y: bb.originY + bb.height * 0.4 };
  const eyeB = kp[1] ? { x: kp[1].x * aw, y: kp[1].y * ah } : { x: bb.originX + bb.width * 0.7, y: bb.originY + bb.height * 0.4 };
  const nose = kp[2] ? { x: kp[2].x * aw, y: kp[2].y * ah } : { x: bb.originX + bb.width / 2, y: bb.originY + bb.height * 0.55 };
  const { rollDeg, yawRatio } = headPose(eyeA, eyeB, nose);

  // --- 3. Mesures -------------------------------------------------------------------------------
  const full = actx.getImageData(0, 0, aw, ah);
  const inner = { x: bb.originX + bb.width * 0.15, y: bb.originY + bb.height * 0.15, w: bb.width * 0.7, h: bb.height * 0.7 };
  const faceLuma = meanLumaRect(full.data, aw, ah, inner.x, inner.y, inner.w, inner.h);
  const bgLuma = backgroundLuma(full.data, aw, ah, bb.originX, bb.originY, bb.width, bb.height);
  const gray = grayCrop(full.data, aw, ah, bb.originX, bb.originY, bb.width, bb.height, 128);
  const sharpness = laplacianVariance(gray, 128);

  // --- 4. Recadrage (dans l'image d'origine) ----------------------------------------------------
  const inv = 1 / scale;
  const crop = cropSquare(bb.originX * inv, bb.originY * inv, bb.width * inv, bb.height * inv, W, H);

  const metrics: PortraitMetrics = {
    faces: 1,
    faceHeightRatio: bb.height / ah,
    yawRatio,
    rollDeg,
    faceLuma,
    bgLuma,
    sharpness,
    cropSidePx: crop.side,
  };
  const issues = judge(metrics);
  const blocking = issues.some((i) => i.level === 'error');

  // --- 5. Rendu final : redressement, recadrage, éclaircissement éventuel -----------------------
  const out = document.createElement('canvas');
  out.width = OUT;
  out.height = OUT;
  const octx = out.getContext('2d', { willReadFrequently: true });
  if (!octx) return fail('Le navigateur ne permet pas le traitement d’image.');
  octx.fillStyle = '#e5e7eb';
  octx.fillRect(0, 0, OUT, OUT);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  const k = OUT / crop.side;
  const level = Math.abs(rollDeg) > 2 && Math.abs(rollDeg) <= 25 ? -rollDeg : 0;
  octx.save();
  octx.translate(OUT / 2, OUT / 2);
  octx.rotate((level * Math.PI) / 180);
  octx.scale(k, k);
  octx.drawImage(img, -crop.cx, -crop.cy);
  octx.restore();

  const backlit = bgLuma / Math.max(faceLuma, 1) > 1.8 && faceLuma < 110;
  if (backlit && faceLuma >= 35) {
    const lut = gammaLut(backlightGamma(faceLuma));
    const data = octx.getImageData(0, 0, OUT, OUT);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }
    octx.putImageData(data, 0, 0);
  }

  // --- 6. Export --------------------------------------------------------------------------------
  let quality = 0.88;
  let blob = await canvasToBlob(out, quality);
  while (blob && blob.size > 350 * 1024 && quality > 0.6) {
    quality -= 0.08;
    blob = await canvasToBlob(out, quality);
  }
  if (!blob) return fail('Export de l’image impossible.');

  return { ok: !blocking, issues, blob, previewUrl: URL.createObjectURL(blob), bytes: blob.size };
}
