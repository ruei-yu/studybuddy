// lib/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // ✅ 不要在 module import 時 throw（避免 build/prerender 直接爆）
  if (!url || !anon) {
    console.error("[Supabase] Missing env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return null;
  }

  _client = createClient(url, anon);
  return _client;
}

/**
 * ✅ 讓你現有程式碼可以繼續用 supabase.from(...)
 * 特色：只有「真的用到 supabase.xx」時才會去拿 client（lazy）
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop: keyof SupabaseClient) {
    const client = getSupabaseBrowserClient();
    if (!client) {
      throw new Error("[Supabase] Missing env. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }
    return (client as any)[prop];
  },
});
