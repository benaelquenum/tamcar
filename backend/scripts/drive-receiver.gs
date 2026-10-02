// TamCar - reception des sauvegardes dans Google Drive (application web Google Apps Script).
// Deploye sous le compte tamcarbackups@gmail.com : execution "Moi", acces "Tout le monde",
// protege par un mot de passe de liaison (Parametres du projet > Proprietes du script > SECRET)
// identique a DRIVE_BACKUP_SECRET cote Vercel. Sans ce mot de passe, toute requete est refusee.
// Actions : ping, put (depose un fichier dans un chemin, cree les dossiers), purge (Secours seulement).
const FOLDER_ID = '1ImvQ_wljQOCJ2MhXR_Lbm4Akg9pHxyc5';

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function same_(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function sub_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function put_(root, b) {
  const parts = String(b.path || '').split('/');
  if (parts.some(function (p) { return !p || p === '..'; })) throw new Error('chemin invalide');
  const name = parts.pop();
  let dir = root;
  parts.forEach(function (p) { dir = sub_(dir, p); });
  const old = dir.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);
  const blob = Utilities.newBlob(Utilities.base64Decode(b.base64), b.mime || 'application/octet-stream', name);
  const f = dir.createFile(blob);
  return { ok: true, id: f.getId(), size: f.getSize() };
}

function purge_(root, b) {
  if (b.path !== 'Secours') throw new Error('purge limitee au dossier Secours');
  const dir = sub_(root, 'Secours');
  const limit = Date.now() - Number(b.keep_days) * 86400000;
  let n = 0;
  [dir.getFiles(), dir.getFolders()].forEach(function (it) {
    while (it.hasNext()) {
      const x = it.next();
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(x.getName());
      if (m && Date.UTC(+m[1], +m[2] - 1, +m[3]) < limit) { x.setTrashed(true); n++; }
    }
  });
  return { ok: true, purged: n };
}

function doPost(e) {
  try {
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    const b = JSON.parse(e.postData.contents);
    if (!secret || typeof b.secret !== 'string' || !same_(b.secret, secret)) return out_({ ok: false, error: 'unauthorized' });
    const root = DriveApp.getFolderById(FOLDER_ID);
    if (b.action === 'ping') return out_({ ok: true, folder: root.getName() });
    if (b.action === 'put') return out_(put_(root, b));
    if (b.action === 'purge') return out_(purge_(root, b));
    return out_({ ok: false, error: 'action inconnue' });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return out_({ ok: true, service: 'tamcar-sauvegardes' });
}
