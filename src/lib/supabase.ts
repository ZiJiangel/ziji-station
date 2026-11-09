import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || 'https://wgtqupyjpykaegrcmsma.supabase.co';
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_YmnctfZ7j0SY-3qCrlwwTg_o5CQuzmM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);