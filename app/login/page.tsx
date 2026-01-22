"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";


export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function sendLink() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
     email,
     options: {
        emailRedirectTo: "http://localhost:3000/auth/callback",
     },
    });
  }

  return (
    <main className="mx-auto max-w-md p-6 space-y-4">
      <h1 className="text-2xl font-semibold">陪考日記 登入</h1>
      <p className="text-sm text-gray-600">
        輸入 Email，我們會寄登入連結給你。
      </p>

      <input
        className="w-full rounded border p-2"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <button
        className="w-full rounded bg-black text-white p-2 disabled:opacity-50"
        onClick={sendLink}
        disabled={!email || loading}
      >
        {loading ? "寄送中..." : "寄登入連結"}
      </button>

      {sent && (
        <div className="rounded bg-green-50 p-3 text-sm">
          已寄出！請去信箱點連結登入。
        </div>
      )}
    </main>
  );
}
