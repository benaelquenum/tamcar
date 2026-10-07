import { registerPlugin } from '@capacitor/core';

// Sonnerie native de l'APK chauffeur récent (alerte forte en boucle, même app en fond). Absent des anciens APK :
// les appels échouent et on retombe sur la notification locale classique.
// UN SEUL enregistrement pour toute l'application : Capacitor refuse (et journalise un avertissement) de
// déclarer deux fois le même plugin.
export type RideAlertPlugin = {
  isSupported(): Promise<{ supported: boolean }>;
  show(opts: {
    ride_id: string;
    title: string;
    body: string;
    category?: string;
    booking?: string;
    tag?: string;
  }): Promise<void>;
  stop(opts: { ride_id: string }): Promise<void>;
};

export const RideAlert = registerPlugin<RideAlertPlugin>('RideAlert');
