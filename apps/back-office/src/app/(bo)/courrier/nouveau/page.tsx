import { NewDocumentForm } from './NewDocumentForm';

export default function NouveauDocumentPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold text-neutral-900">
        Enregistrer un document
      </h1>
      <p className="mt-xs text-sm text-neutral-600">
        Scannez ou photographiez la pièce : elle est numérotée automatiquement
        et rangée dans le coffre documentaire.
      </p>
      <NewDocumentForm />
    </div>
  );
}
