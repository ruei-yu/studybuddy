"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function CallbackClient() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    (async () => {
      // Supabase OAuth code flow：用 code 交換 session
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[auth callback] exchange error:", error);
          router.replace("/login?error=callback");
          return;
        }
      }

      router.replace("/today");
    })();
  }, [params, router]);

  return <div className="p-6 text-sm text-zinc-600">Signing in...</div>;
}
