import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('缺少 PUBLIC_SUPABASE_URL 或 PUBLIC_SUPABASE_ANON_KEY 环境变量');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
