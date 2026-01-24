"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const ACCOUNT_MAP: Record<string, { email: string; role: "supporter" | "writer" }> = {
  rueiyu: { email: "rueiyu@studybuddy.local", role: "supporter" },
  wilson: { email: "wilson@studybuddy.local", role: "writer" },
};

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    const key = name.trim().toLowerCase();
    const acc = ACCOUNT_MAP[key];

    if (!acc) return alert("名字只接受 rueiyu 或 wilson");
    if (!pin.trim()) return alert("請輸入 PIN");

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: acc.email,
        password: pin.trim(),
      });
      if (error) throw error;

      // ✅ 你想要「只輸入一次」：存到 localStorage 讓你做 UI 分流也行
      localStorage.setItem("sb_name", key);
      localStorage.setItem("sb_role_hint", acc.role);

      router.replace("/today");
    } catch (e: any) {
      alert(e?.message ?? "登入失敗");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-rose-50 px-4">
      <div className="w-full max-w-sm rounded-3xl border border-rose-200 bg-white p-6 shadow-sm space-y-4">
        <h1 className="text-xl font-semibold text-zinc-900">StudyBuddy 登入</h1>
        <p className="text-sm text-zinc-600">輸入名字 + PIN（不寄信，只需一次）</p>

        <div className="space-y-2">
          <div className="text-sm font-medium">名字</div>
          <input
            className="w-full rounded-2xl border border-rose-200 px-3 py-3 outline-none text-zinc-900 placeholder:text-zinc-500 bg-white"
            placeholder="rueiyu / wilson"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">PIN</div>
          <input
            className="w-full rounded-2xl border border-rose-200 px-3 py-3 outline-none text-zinc-900 placeholder:text-zinc-500 bg-white"
            placeholder="輸入 PIN (生日)"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </div>

        <button
          onClick={onLogin}
          disabled={loading}
          className={`w-full rounded-2xl py-3 font-medium text-white ${
            loading ? "bg-zinc-400" : "bg-rose-600 hover:bg-rose-700"
          }`}
        >
          {loading ? "登入中..." : "登入"}
        </button>

        <div className="text-xs text-zinc-500">
          分流規則：rueiyu → supporter，wilson → writer
        </div>
      </div>
    </main>
  );
}
