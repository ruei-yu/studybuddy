"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      router.replace(data.session ? "/today" : "/login");
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      router.replace(session ? "/today" : "/login");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return <div className="min-h-screen grid place-items-center text-sm">Loading...</div>;
}
