import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export type Profile = {
  id: string;
  email: string;
  role: 'admin' | 'user';
  is_blocked: boolean;
  access_approved: boolean;
  email_verified: boolean;
};

export type Category = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type AppCard = {
  id: string;
  category_id: string;
  name: string;
  link: string;
  created_at: string;
  updated_at: string;
};
