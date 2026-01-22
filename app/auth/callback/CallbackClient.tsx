"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function CallbackClient() {
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    const error = sp.get("error") || sp.get("error_description");
    if (error) {
      router.replace(`/login?error=${encodeURIComponent(error)}`);
      return;
    }

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace("/today");
      else router.replace("/login?error=no_session");
    })();
  }, [router, sp]);

  return <div className="p-6">登入中...</div>;
}
