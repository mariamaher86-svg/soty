// Her own Supabase project (for the optional account + sync). Paste the two values from the Supabase dashboard
// between the quotes. Both are public by design: the publishable/anon key only allows what the database rules
// (Row Level Security in supabase/schema.sql) allow — each person sees only their own rows. Never put the
// "service_role" / secret key here.
// Leave them empty and the app works exactly as before, on this device only.

export const SUPABASE_URL = ''; // e.g. https://abcdefghijklmnop.supabase.co
export const SUPABASE_ANON_KEY = ''; // the "Publishable key" (sb_publishable_…) or the legacy "anon public" key

// (Optional) the same two values can also come from the build: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
export const supabaseUrl = SUPABASE_URL || (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
export const supabaseKey = SUPABASE_ANON_KEY || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';
