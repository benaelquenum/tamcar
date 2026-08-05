/**
 * Rend un texte du guide en gras là où il est encadré par **doubles astérisques**.
 * Permet d'écrire le contenu en chaînes JS lisibles plutôt qu'en JSX échappé.
 */
export function RichText({ children }: { children: string }) {
  const parts = children.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-bold text-neutral-900">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
