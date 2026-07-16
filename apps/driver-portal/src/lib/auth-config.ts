/**
 * Méthode d'auth active. Basculable via NEXT_PUBLIC_AUTH_METHOD :
 *   - 'email' (défaut) — magic link email, gratuit (dev + tests)
 *   - 'phone'          — OTP SMS via Twilio (prod)
 */
export type AuthMethod = 'email' | 'phone';

const RAW = process.env.NEXT_PUBLIC_AUTH_METHOD?.toLowerCase();

export const AUTH_METHOD: AuthMethod = RAW === 'phone' ? 'phone' : 'email';
