"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";

const RUEIYU_EMAIL = "rueiyu0910906@gmail.com"; // ✅ 改成 rueiyu 登入 Dashboard 的信箱

const subjects = [
  { name: "行政法", target: 3 },
  { name: "行政學", target: 2 },
  { name: "刑訴法", target: 3 },
  { name: "刑法", target: 1.5 },
  { name: "公務員法", target: 1 },
  { name: "憲法", target: 0.5 },
] as const;

type Role = "supporter" | "writer";

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

async function getMyProfile() {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return { profile: null, error: userErr };
  if (!user) return { profile: null, error: new Error("No user session") };

  const { data, error } = await supabase
    .from("profiles")
    .select("couple_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { profile: null, error };
  if (!data) return { profile: null, error: new Error("Profile not found") };

  return { profile: data, error: null };
}

async function getWriterIdByCoupleId(coupleId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, role")
    .eq("couple_id", coupleId);

  if (error) throw error;

  const writer = (data ?? []).find((p: any) => p.role === "writer");
  if (!writer?.user_id) throw new Error("Writer not found in profiles");

  return writer.user_id as string;
}

async function fetchWriterProgressByDate(coupleId: string, writerId: string, date: string) {
  const { data, error } = await supabase
    .from("study_progress")
    .select("user_id, couple_id, date, done, total_done, unlocked")
    .eq("couple_id", coupleId)
    .eq("user_id", writerId)
    .eq("date", date)
    .maybeSingle();

  return { data, error };
}

async function upsertWriterProgress({
  coupleId,
  writerId,
  date,
  done,
  totalDone,
  unlocked,
}: {
  coupleId: string;
  writerId: string;
  date: string;
  done: number[];
  totalDone: number;
  unlocked: boolean;
}) {
  const payload: any = {
    user_id: writerId,
    couple_id: coupleId,
    date,
    done,
    total_done: totalDone,
    unlocked,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("study_progress").upsert(payload, {
    onConflict: "user_id,date",
  });

  return { error };
}

export default function RueiyuBackfillPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [meEmail, setMeEmail] = useState<string>("");
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [writerId, setWriterId] = useState<string | null>(null);

  const [date, setDate] = useState<string>(() => toISODate(new Date()));
  const [done, setDone] = useState<number[]>(subjects.map(() => 0));
  const totalTarget = useMemo(() => subjects.reduce((s, x) => s + x.target, 0), []);
  const totalDone = useMemo(() => done.reduce((s, x) => s + (Number(x) || 0), 0), [done]);

  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string>("");

  // ✅ 登入檢查 + 取得 coupleId / writerId
  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        router.replace("/login");
        return;
      }

      const { data: u } = await supabase.auth.getUser();
      const email = u.user?.email ?? "";
      setMeEmail(email);

      const { profile, error } = await getMyProfile();
      if (error) {
        setHint("讀取 profile 失敗：" + String(error.message || error));
        setReady(true);
        return;
      }

      const cid = profile?.couple_id ?? null;
      if (!cid) {
        setHint("找不到 couple_id，請確認 profiles 有資料。");
        setReady(true);
        return;
      }

      setCoupleId(cid);

      try {
        const wid = await getWriterIdByCoupleId(cid);
        setWriterId(wid);
      } catch (e: any) {
        setHint("找不到 writerId：" + String(e?.message || e));
      }

      setReady(true);
    })();
  }, [router]);

  // ✅ 日期切換時，自動載入 Wilson 當天原本紀錄（避免覆蓋）
  useEffect(() => {
    if (!coupleId || !writerId) return;

    (async () => {
      setLoading(true);
      setHint("");

      const { data, error } = await fetchWriterProgressByDate(coupleId, writerId, date);
      if (error) {
        setHint("讀取該日 Wilson 紀錄失敗：" + error.message);
        setDone(subjects.map(() => 0));
        setLoading(false);
        return;
      }

      if (!data) {
        setHint("這天 Wilson 沒有紀錄，已載入空白（可直接補登記）。");
        setDone(subjects.map(() => 0));
        setLoading(false);
        return;
      }

      const d = Array.isArray((data as any).done) ? ((data as any).done as number[]) : subjects.map(() => 0);
      setDone(subjects.map((_, i) => Number(d[i] ?? 0) || 0));
      setHint("已載入 Wilson 當天原本紀錄（你可以直接修改再儲存）。");
      setLoading(false);
    })();
  }, [coupleId, writerId, date]);

  const allowed = meEmail === RUEIYU_EMAIL;

  const unlocked = totalTarget === 0 ? false : totalDone / totalTarget >= 2 / 3;

  async function save() {
    if (!coupleId || !writerId) return;
    setLoading(true);
    setHint("");

    const { error } = await upsertWriterProgress({
      coupleId,
      writerId,
      date,
      done,
      totalDone,
      unlocked,
    });

    if (error) {
      setHint("❌ 儲存失敗：" + error.message);
    } else {
      setHint("✅ 已成功幫 Wilson 補登記（已寫入 study_progress）！");
    }
    setLoading(false);
  }

  if (!ready) {
    return <div className="p-8">Loading...</div>;
  }

  if (!allowed) {
    return (
      <main className="min-h-screen bg-rose-50 p-6">
        <div className="mx-auto max-w-xl rounded-3xl border border-rose-200 bg-white p-6">
          <div className="text-lg font-semibold text-zinc-900">你沒有權限進入這個頁面</div>
          <div className="mt-2 text-sm text-zinc-600">
            目前登入：<span className="font-mono">{meEmail || "(no email)"}</span>
          </div>
          <div className="mt-2 text-sm text-zinc-600">
            需要：<span className="font-mono">{RUEIYU_EMAIL}</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-orange-50 p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-3xl border border-rose-200 bg-white/80 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-zinc-900">🧾 Rueiyu 補登記（Wilson）</div>
              <div className="text-xs text-zinc-500 mt-1">
                寫入：study_progress（user_id=writerId）
              </div>
            </div>

            <button
              onClick={() => router.push("/today")}
              className="rounded-2xl border border-rose-200 bg-white/90 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
            >
              回今日頁
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-rose-200 bg-white/80 p-4">
              <div className="text-xs text-zinc-500">日期</div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-rose-200 bg-white/90 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>

            <div className="rounded-2xl border border-rose-200 bg-white/80 p-4">
              <div className="text-xs text-zinc-500">Wilson 當日總時數</div>
              <div className="mt-2 text-2xl font-semibold text-rose-700">
                {totalDone.toFixed(1)}h
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                解鎖判定：{unlocked ? "已達 2/3" : "未達 2/3"}
              </div>
            </div>
          </div>

          {hint ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-white/80 p-3 text-sm text-zinc-700">
              {hint}
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-rose-200 bg-white/80 p-5 shadow-sm space-y-4">
          <div className="text-sm font-medium text-zinc-900">補登記各科時數</div>

          {subjects.map((s, i) => {
            const v = Number(done[i] || 0);
            const ratio = s.target === 0 ? 0 : v / s.target;

            return (
              <div key={s.name} className="rounded-2xl border border-rose-200/60 bg-white/70 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-zinc-900">
                    {s.name} <span className="text-zinc-500 text-sm">目標 {s.target}h</span>
                  </div>
                  <div className="text-sm text-rose-700 font-medium">
                    {Math.round(clamp(ratio, 0, 1) * 100)}%
                  </div>
                </div>

                <div className="h-2 w-full rounded-full bg-rose-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all"
                    style={{ width: `${clamp(ratio * 100, 0, 100)}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 items-center">
                  <button
                    className="rounded-2xl border border-rose-200 bg-white/80 py-3 font-semibold text-rose-700 active:scale-[0.99]"
                    onClick={() =>
                      setDone((prev) => prev.map((x, idx) => (idx === i ? clamp((Number(x) || 0) - 0.5, 0, 99) : x)))
                    }
                  >
                    -0.5
                  </button>

                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    inputMode="decimal"
                    className="w-full text-center rounded-2xl bg-white/90 border border-rose-200 px-3 py-3 text-base font-semibold outline-none focus:ring-2 focus:ring-rose-200"
                    value={v}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setDone((prev) => prev.map((x, idx) => (idx === i ? (isNaN(n) ? 0 : n) : x)));
                    }}
                  />

                  <button
                    className="rounded-2xl border border-rose-200 bg-white/80 py-3 font-semibold text-rose-700 active:scale-[0.99]"
                    onClick={() =>
                      setDone((prev) => prev.map((x, idx) => (idx === i ? clamp((Number(x) || 0) + 0.5, 0, 99) : x)))
                    }
                  >
                    +0.5
                  </button>
                </div>
              </div>
            );
          })}

          <button
            onClick={save}
            disabled={loading || !coupleId || !writerId}
            className={`w-full rounded-2xl py-3 font-medium shadow-sm active:scale-[0.99] ${
              loading ? "bg-zinc-400 text-white" : "bg-rose-600 text-white hover:bg-rose-700"
            }`}
          >
            {loading ? "儲存中..." : "✅ 儲存 Wilson 補登記"}
          </button>

          <div className="text-xs text-zinc-500">
            這個頁面會直接寫入 study_progress（Wilson / 指定日期）。若那天原本有紀錄會先載入，避免你覆蓋到錯資料。
          </div>
        </div>
      </div>
    </main>
  );
}