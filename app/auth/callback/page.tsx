"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient"; // 依你專案路徑調整

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        // 1) Supabase OAuth code 交換 session（PKCE flow）
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) console.error("[exchangeCodeForSession] error:", error);
        }

        // 2) 交換完導回首頁（或你要的頁）
        router.replace("/");
      } catch (e) {
        console.error("[auth/callback] crashed:", e);
        router.replace("/login");
      }
    })();
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="rounded-2xl border border-rose-200 bg-white/80 px-6 py-5 text-sm text-zinc-700">
        登入處理中…請稍候 💫
      </div>
    </main>
  );
}
