"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [msg, setMsg] = useState("登入處理中...");

  useEffect(() => {
    (async () => {
      const code = params.get("code");

      // 1) 如果是 magic link 回來，會有 code
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMsg("登入交換失敗：" + error.message);
          return;
        }
      }

      // 2) 再確認 session 是否存在
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setMsg("登入成功！跳轉中...");
        router.replace("/today");
      } else {
        setMsg("還沒登入成功，請回到 /login 再試一次。");
      }
    })();
  }, [params, router]);

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Auth Callback</h1>
      <p className="mt-2 text-sm text-gray-600">{msg}</p>
    </main>
  );
}
