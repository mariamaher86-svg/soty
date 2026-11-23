// Web Push (reminders). The PUBLIC VAPID key only: it is meant to be in the app. The private key is a secret that lives
// only in Supabase (Edge Functions → Secrets → VAPID_PRIVATE_KEY) and is never in this repository.
// A new pair needs the same public key in Supabase's VAPID_PUBLIC_KEY secret.

export const VAPID_PUBLIC_KEY = 'BMEuBTSRf1V-PHsjmxHaPIbq-OFO9pS2WgAdyNeoZ_O6rFLQY49ZzOPzvkEFibwd6PI-BVYyKLFfyjc1m22cTIk';
