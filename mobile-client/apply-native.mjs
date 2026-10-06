// Applique au projet Android (mobile-client/android, NON versionné) le code natif suivi dans native/ :
//   - Java : MainActivity (enregistre le plugin RideLive), RideLivePlugin, TamCarMessagingService, RideLiveNotifier
//   - ressources : icônes de véhicules (générées), mise en page de la carte de suivi
//   - tests d'instrumentation (contrôle visuel sur émulateur)
//   - manifeste : permissions de notification, service FCM de l'application à la place de celui du plugin
//   - build.gradle de l'application : dépendances firebase-messaging et androidx.core
// Idempotent : on peut le relancer autant de fois que nécessaire. Appelé par build-apk.bat.
// Usage : node apply-native.mjs

import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ANDROID = join(HERE, 'android');
const MAIN = join(ANDROID, 'app', 'src', 'main');

if (!existsSync(MAIN)) {
  console.error('Projet Android introuvable : lancez d\'abord « npx cap add android » puis « npx cap sync android ».');
  process.exit(1);
}

// 1) fichiers
cpSync(join(HERE, 'native', 'java'), join(MAIN, 'java'), { recursive: true });
cpSync(join(HERE, 'native', 'res'), join(MAIN, 'res'), { recursive: true });
cpSync(join(HERE, 'native', 'androidTest', 'java'), join(ANDROID, 'app', 'src', 'androidTest', 'java'), { recursive: true });

// 2) manifeste
const manifestPath = join(MAIN, 'AndroidManifest.xml');
let m = readFileSync(manifestPath, 'utf8');
if (!m.includes('xmlns:tools')) {
  m = m.replace(
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n    xmlns:tools="http://schemas.android.com/tools">',
  );
}
for (const perm of ['android.permission.POST_NOTIFICATIONS', 'android.permission.POST_PROMOTED_NOTIFICATIONS']) {
  if (!m.includes(perm)) {
    m = m.replace('    <uses-feature', `    <uses-permission android:name="${perm}"/>\n\n    <uses-feature`);
  }
}
if (!m.includes('TamCarMessagingService')) {
  const service = `        <!-- Suivi du chauffeur en direct : notre service FCM remplace celui du plugin push (il lui repasse
             tous les autres messages). -->
        <service
            android:name="com.capacitorjs.plugins.pushnotifications.MessagingService"
            tools:node="remove"/>
        <service
            android:name=".TamCarMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT"/>
            </intent-filter>
        </service>

        <provider`;
  m = m.replace('        <provider', service);
}
writeFileSync(manifestPath, m);

// 3) dépendances de l'application
const gradlePath = join(ANDROID, 'app', 'build.gradle');
let g = readFileSync(gradlePath, 'utf8');
if (!g.includes('firebase-messaging')) {
  g = g.replace(
    "    implementation project(':capacitor-android')",
    "    implementation project(':capacitor-android')\n    implementation \"com.google.firebase:firebase-messaging:25.0.1\"\n    implementation \"androidx.core:core:$androidxCoreVersion\"",
  );
  writeFileSync(gradlePath, g);
}
console.log('Code natif appliqué au projet Android.');
