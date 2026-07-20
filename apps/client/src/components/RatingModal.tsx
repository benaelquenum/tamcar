'use client';

import { useState } from 'react';
import { CheckIcon, StarIcon } from './Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useT } from '@/lib/i18n-client';

type Props = {
  open: boolean;
  onClose: () => void;
  rideId: string;
  ratedName: string;
  onSubmitted?: () => void;
  /** Mode obligatoire : cache "Plus tard", bloque ESC et clic backdrop */
  mandatory?: boolean;
};

export function RatingModal({ open, onClose, rideId, ratedName, onSubmitted, mandatory }: Props) {
  const t = useT();
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  async function submit() {
    if (stars < 1) {
      setError('Choisis au moins une étoile.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: rpcErr } = await supabaseBrowser.rpc('rate_ride', {
      p_ride_id: rideId,
      p_stars: stars,
      p_comment: comment.trim() || null,
    });
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setSuccess(true);
    onSubmitted?.();
    setTimeout(() => onClose(), 900);
  }

  const displayStars = hover || stars;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/70 backdrop-blur-sm sm:items-center"
      onClick={mandatory ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-lg text-center">
          {mandatory && (
            <p className="mb-sm inline-block rounded-full bg-primary-50 px-md py-xs text-[10px] font-bold uppercase tracking-wider text-primary-700">
              {t('rating.required')}
            </p>
          )}
          <h2 className="text-xl font-extrabold text-neutral-900">
            {t('rating.how_ride', { name: ratedName })}
          </h2>
          <p className="mt-xs text-sm text-neutral-600">
            {mandatory ? t('rating.your_note_unlocks') : t('rating.your_note_unlocks')}
          </p>
        </div>

        {success ? (
          <div className="rounded-xl bg-primary-50 p-xl text-center">
            <span className="grid mx-auto mb-md h-12 w-12 place-items-center rounded-full bg-primary-500 text-white">
              <CheckIcon className="h-6 w-6" strokeWidth={3} />
            </span>
            <p className="font-bold text-neutral-900">Merci !</p>
          </div>
        ) : (
          <>
            {/* Stars */}
            <div
              className="mb-lg flex items-center justify-center gap-sm"
              onMouseLeave={() => setHover(0)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setStars(n)}
                  onMouseEnter={() => setHover(n)}
                  aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                  className="p-xs transition-transform hover:scale-110 active:scale-95"
                >
                  <StarIcon
                    className={`h-10 w-10 ${n <= displayStars ? 'text-gold-500' : 'text-neutral-200'}`}
                  />
                </button>
              ))}
            </div>

            {stars > 0 && (
              <p className="mb-md text-center text-sm font-semibold text-neutral-900">
                {stars === 5 && 'Excellent !'}
                {stars === 4 && 'Très bien'}
                {stars === 3 && 'Correct'}
                {stars === 2 && 'Décevant'}
                {stars === 1 && 'À éviter'}
              </p>
            )}

            <div className="mb-md">
              <label htmlFor="rating-comment" className="mb-xs block text-sm font-semibold text-neutral-900">
                {t('rating.comment_optional')}
              </label>
              <textarea
                id="rating-comment"
                rows={3}
                maxLength={500}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('rating.comment_placeholder')}
                className="w-full resize-none rounded-xl bg-neutral-100 px-lg py-md text-sm text-neutral-900 shadow-sm ring-1 ring-neutral-200 transition placeholder:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {error && (
              <div className="mb-md rounded-md bg-error/10 p-md text-sm text-error">
                {error}
              </div>
            )}

            <div className="flex gap-md">
              {!mandatory && (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-600 hover:border-neutral-300"
                >
                  Plus tard
                </button>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={submitting || stars < 1}
                className={`${mandatory ? 'w-full' : 'flex-1'} rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {submitting ? '…' : t('rating.send')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
