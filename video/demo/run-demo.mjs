// Lance la demonstration : serveur Supabase fictif (port 54321) + app client (port 3011) + app chauffeur (port 3012) branchees dessus.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..', '..');
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'demo-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'demo-service-key',
  NEXT_TELEMETRY_DISABLED: '1',
};
const mock = spawn(process.execPath, [path.join(ICI, 'mock-supabase.mjs')], { stdio: 'inherit', env });
const next = spawn('npm', ['run', 'dev', '--prefix', path.join(RACINE, 'apps', 'client'), '--', '-p', '3011'], { stdio: 'inherit', env, shell: true });
const nextChauffeur = spawn('npm', ['run', 'dev', '--prefix', path.join(RACINE, 'apps', 'driver-portal'), '--', '-p', '3012'], { stdio: 'inherit', env, shell: true });
const fin = () => { mock.kill(); next.kill(); nextChauffeur.kill(); process.exit(0); };
process.on('SIGINT', fin); process.on('SIGTERM', fin);
next.on('exit', fin);
