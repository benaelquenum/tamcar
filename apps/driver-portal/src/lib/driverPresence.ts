'use client';

// ============================================================
// Le chauffeur est-il en ligne ? Petit magasin partagé.
//
// L'accueil sait si le chauffeur est en ligne ; le veilleur global de nouvelles
// courses (monté dans le layout) l'ignorait et interrogeait la base toutes les
// 8 s même hors ligne. Il lit maintenant cet état : hors ligne, il ne demande
// plus rien — chaque requête évitée est de la data économisée.
// ============================================================

type Listener = () => void;

let online: boolean | null = null; // null = inconnu (page ouverte directement)
const listeners = new Set<Listener>();

export function setDriverOnline(value: boolean): void {
  if (online === value) return;
  online = value;
  listeners.forEach((l) => l());
}

export function getDriverOnline(): boolean | null {
  return online;
}

export function subscribeDriverOnline(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
