/**
 * Formate un nom pour l'affichage en « casse titre » (première lettre de chaque
 * mot en majuscule, le reste en minuscule). Beaucoup de noms sont saisis en
 * MAJUSCULES ; on les rend lisibles sans toucher aux données.
 * Gère les composés et élisions : « JEAN-MARC N'DIAYE » → « Jean-Marc N'Diaye ».
 */
export function titleCaseName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .trim()
    .toLocaleLowerCase('fr')
    .replace(/(^|[\s'’-])([a-zà-öø-ÿ])/g, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('fr'));
}
