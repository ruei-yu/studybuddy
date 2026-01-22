"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const BUCKET = "daily-photos";

const subjects = [
  { name: "行政法", target: 3 },
  { name: "行政學", target: 2 },
  { name: "刑訴法", target: 3 },
  { name: "刑法", target: 1.5 },
  { name: "公務員法", target: 1 },
  { name: "憲法", target: 0.5 },
] as const;

type DayRecord = {
  done: number[];
  partnerMessage?: string;

  // ✅ Supabase Storage 永久路徑（跨裝置）
  couplePhotoPath?: string;
  dailyPhotoPaths?: string[];

  // ✅ Supabase 欄位（更準）
  totalDone?: number;
  unlocked?: boolean;

  // ✅ 新增：每科今天讀什麼（與 subjects 對齊）
  subjectNotes?: string[];

  // ✅ 新增：每日心得（日記，不上鎖）
  diary?: string;

  // 本機 UI 狀態（一天一次）
  unlockModalShown?: boolean;
};

type HistoryStore = Record<string, DayRecord>;
type TabKey = "checkin" | "unlock" | "photos" | "history";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function readHistory(): HistoryStore {
  try {
    const raw = localStorage.getItem("studybuddy_history_v1");
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeHistory(store: HistoryStore) {
  localStorage.setItem("studybuddy_history_v1", JSON.stringify(store));
}

/** 日期新→舊 */
function sortDatesDesc(dates: string[]) {
  return dates.slice().sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/** 取得 public 永久 URL（bucket 必須是 public） */
function publicUrl(path: string) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** 檔名安全化 */
function safeName(name: string) {
  const cleaned = name.replace(/[^\w.\-]+/g, "_");
  return cleaned.length ? cleaned : `file_${Date.now()}`;
}

/** 小彩帶 */
function ConfettiBurst({ active }: { active: boolean }) {
  const pieces = useMemo(() => {
    if (!active) return [];
    const palette = ["#fb7185", "#f97316", "#f59e0b", "#fda4af", "#a78bfa", "#34d399"];
    return Array.from({ length: 70 }).map((_, i) => {
      const left = Math.random() * 100;
      const delay = Math.random() * 0.35;
      const duration = 0.9 + Math.random() * 0.9;
      const size = 6 + Math.random() * 8;
      const rotate = Math.random() * 360;
      const color = palette[Math.floor(Math.random() * palette.length)];
      return { i, left, delay, duration, size, rotate, color };
    });
  }, [active]);

  if (!active) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
        {pieces.map((p) => (
          <span
            key={p.i}
            className="confetti-piece"
            style={
              {
                left: `${p.left}vw`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                width: `${p.size}px`,
                height: `${p.size * 0.45}px`,
                backgroundColor: p.color,
                transform: `translateY(-10vh) rotate(${p.rotate}deg)`,
              } as any
            }
          />
        ))}
      </div>

      <style jsx global>{`
        .confetti-piece {
          position: absolute;
          top: -10vh;
          border-radius: 999px;
          opacity: 0.95;
          animation-name: confetti-fall;
          animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
          animation-fill-mode: both;
        }
        @keyframes confetti-fall {
          0% {
            transform: translateY(-10vh) rotate(0deg);
            opacity: 0.95;
          }
          100% {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}

/** 上方 tabs（桌機用） */
function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-2xl px-3 py-3 text-sm font-medium border transition ${
        active
          ? "bg-rose-600 text-white border-rose-600 shadow-sm"
          : "bg-white/70 text-rose-700 border-rose-200 hover:bg-white"
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        <span>{icon}</span>
        <span>{label}</span>
        {badge ? (
          <span
            className={`ml-1 text-[11px] px-2 py-0.5 rounded-full border ${
              active
                ? "border-white/50 bg-white/20 text-white"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {badge}
          </span>
        ) : null}
      </div>
    </button>
  );
}

/** 手機底部 tab bar */
function BottomTabBar({
  tab,
  setTab,
  unlockBadge,
  photosBadge,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  unlockBadge: string;
  photosBadge?: string;
}) {
  const Item = ({
    k,
    icon,
    label,
    badge,
  }: {
    k: TabKey;
    icon: string;
    label: string;
    badge?: string;
  }) => {
    const active = tab === k;
    return (
      <button
        onClick={() => setTab(k)}
        className={`flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-2xl transition ${
          active ? "bg-rose-600 text-white" : "text-rose-700 hover:bg-white/70"
        }`}
      >
        <div className="text-lg leading-none">{icon}</div>
        <div className="text-[11px] font-medium">{label}</div>
        {badge ? (
          <div
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              active ? "border-white/40 bg-white/20" : "border-rose-200 bg-rose-50"
            }`}
          >
            {badge}
          </div>
        ) : (
          <div className="h-[18px]" />
        )}
      </button>
    );
  };

  return (
    <div className="fixed bottom-3 left-0 right-0 z-40 px-3">
      <div className="mx-auto max-w-3xl rounded-3xl border border-rose-200 bg-white/80 backdrop-blur shadow-lg p-2">
        <div className="grid grid-cols-4 gap-2">
          <Item k="checkin" icon="📝" label="打卡" />
          <Item k="unlock" icon="🎁" label="解鎖" badge={unlockBadge} />
          <Item k="photos" icon="📷" label="照片" badge={photosBadge} />
          <Item k="history" icon="🗓️" label="回顧" />
        </div>
      </div>
    </div>
  );
}

export default function TodayPage() {
  const dateKey = useMemo(() => todayISO(), []);
  const unlockSectionRef = useRef<HTMLElement | null>(null);

  // ====== 分頁 ======
  const [tab, setTab] = useState<TabKey>("checkin");

  // ====== Local/Supabase Store ======
  const [history, setHistory] = useState<HistoryStore>({});
  const [done, setDone] = useState<number[]>(subjects.map(() => 0));
  const [partnerMessageDraft, setPartnerMessageDraft] = useState<string>("");

  // ✅ 新增：每科今天讀什麼
  const [subjectNotes, setSubjectNotes] = useState<string[]>(subjects.map(() => ""));
  // ✅ 新增：每日心得（日記，不上鎖）
  const [diaryDraft, setDiaryDraft] = useState<string>("");

  // ✅ Storage paths（永久）
  const [couplePhotoPath, setCouplePhotoPath] = useState<string | null>(null);
  const [dailyPhotoPaths, setDailyPhotoPaths] = useState<string[]>([]);

  // ✅ cache bust：只需要對「固定路徑覆蓋」的合照處理
  const [couplePhotoVersion, setCouplePhotoVersion] = useState<number>(0);

  // 上傳狀態
  const [uploadingCouple, setUploadingCouple] = useState(false);
  const [uploadingDaily, setUploadingDaily] = useState(false);

  // ====== UI states ======
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [confettiOn, setConfettiOn] = useState(false);

  // ====== 計算進度 / 解鎖 ======
  const totalTarget = useMemo(() => subjects.reduce((s, x) => s + x.target, 0), []);
  const localTotalDone = useMemo(() => done.reduce((sum, h) => sum + (Number(h) || 0), 0), [done]);

  const computedUnlocked = totalTarget === 0 ? false : localTotalDone / totalTarget >= 2 / 3;

  // ✅ 以「Supabase 同步回來的」為主（如果有），沒有就用當下 done
  const todayFromHistory = history[dateKey];
  const effectiveTotalDone =
    typeof todayFromHistory?.totalDone === "number" ? todayFromHistory.totalDone : localTotalDone;

  const effectiveUnlocked = totalTarget === 0 ? false : effectiveTotalDone / totalTarget >= 2 / 3;

  const progress = totalTarget === 0 ? 0 : effectiveTotalDone / totalTarget;
  const needHoursToUnlock = Math.max(0, (2 / 3) * totalTarget - effectiveTotalDone);

  // 分頁 badge
  const unlockBadge = effectiveUnlocked ? "已解鎖" : `差 ${needHoursToUnlock.toFixed(1)}h`;
  const photosBadge = dailyPhotoPaths.length ? `${dailyPhotoPaths.length}張` : undefined;

  // ========== Step A：先讀本機（離線也能看）==========
  useEffect(() => {
    const store = readHistory();
    setHistory(store);

    const today = store[dateKey];
    if (today?.done?.length) setDone(today.done);
    if (typeof today?.partnerMessage === "string") setPartnerMessageDraft(today.partnerMessage);
    if (typeof today?.couplePhotoPath === "string") setCouplePhotoPath(today.couplePhotoPath);
    if (Array.isArray(today?.dailyPhotoPaths)) setDailyPhotoPaths(today.dailyPhotoPaths);

    // ✅ subjectNotes
    if (Array.isArray(today?.subjectNotes)) {
      const padded = subjects.map((_, i) => String(today.subjectNotes?.[i] ?? ""));
      setSubjectNotes(padded);
    }

    // ✅ diary
    if (typeof today?.diary === "string") setDiaryDraft(today.diary);
  }, [dateKey]);

  // ========== Step A：再從 Supabase 同步近 30 天（跨裝置）==========
  useEffect(() => {
    (async () => {
      const { data, error } = await fetchDailyFromSupabase();
      if (error) {
        console.error("[fetchDailyFromSupabase] error:", error);
        return;
      }
      if (!data) return;

      // 回灌 history + 同步今天畫面
      setHistory((prev) => {
        const next: HistoryStore = { ...prev };

        for (const row of data as any[]) {
          next[row.date] = {
            ...(next[row.date] || {}),
            done: Array.isArray(row.done) ? row.done : subjects.map(() => 0),
            totalDone: typeof row.total_done === "number" ? row.total_done : next[row.date]?.totalDone,
            unlocked: typeof row.unlocked === "boolean" ? row.unlocked : next[row.date]?.unlocked,
            partnerMessage:
              typeof row.partner_message === "string" ? row.partner_message : next[row.date]?.partnerMessage,
            couplePhotoPath:
              typeof row.couple_photo_path === "string" ? row.couple_photo_path : next[row.date]?.couplePhotoPath,
            dailyPhotoPaths: Array.isArray(row.daily_photo_paths) ? row.daily_photo_paths : next[row.date]?.dailyPhotoPaths,

            // ✅ 新增：subjectNotes / diary
            subjectNotes: Array.isArray(row.subject_notes)
              ? row.subject_notes.map((x: any) => String(x ?? ""))
              : next[row.date]?.subjectNotes,
            diary: typeof row.diary === "string" ? row.diary : next[row.date]?.diary,
          };
        }

        writeHistory(next);
        return next;
      });

      // 如果 Supabase 有今天資料，直接更新 TodayPage 狀態（以 Supabase 為主）
      const todayRow = (data as any[]).find((x) => x.date === dateKey);
      if (todayRow) {
        if (Array.isArray(todayRow.done)) setDone(todayRow.done);
        if (typeof todayRow.partner_message === "string") setPartnerMessageDraft(todayRow.partner_message);
        if (typeof todayRow.couple_photo_path === "string") setCouplePhotoPath(todayRow.couple_photo_path);
        if (Array.isArray(todayRow.daily_photo_paths)) setDailyPhotoPaths(todayRow.daily_photo_paths);

        // ✅ subjectNotes
        if (Array.isArray(todayRow.subject_notes)) {
          const padded = subjects.map((_, i) => String(todayRow.subject_notes?.[i] ?? ""));
          setSubjectNotes(padded);
        }

        // ✅ diary
        if (typeof todayRow.diary === "string") setDiaryDraft(todayRow.diary);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  // ✅ 合照路徑變更就 bust（避免看到舊圖）
  useEffect(() => {
    if (couplePhotoPath) setCouplePhotoVersion(Date.now());
  }, [couplePhotoPath]);

  // ========== 本機快取（離線保留 + UI 秒開）==========
  useEffect(() => {
    setHistory((prev) => {
      const next: HistoryStore = { ...prev };
      next[dateKey] = {
        ...(next[dateKey] || {}),
        done,
        partnerMessage: partnerMessageDraft || undefined,
        couplePhotoPath: couplePhotoPath || undefined,
        dailyPhotoPaths: dailyPhotoPaths.length ? dailyPhotoPaths : undefined,

        // ✅ 新增
        subjectNotes: subjectNotes.length ? subjectNotes : undefined,
        diary: diaryDraft || undefined,

        // 也把當天算出的寫回去（回顧牆可直接用）
        totalDone: localTotalDone,
        unlocked:
          typeof next[dateKey]?.unlocked === "boolean"
            ? next[dateKey]!.unlocked
            : totalTarget === 0
            ? false
            : localTotalDone / totalTarget >= 2 / 3,

        unlockModalShown: next[dateKey]?.unlockModalShown ?? false,
      };
      writeHistory(next);
      return next;
    });
  }, [
    dateKey,
    done,
    partnerMessageDraft,
    couplePhotoPath,
    dailyPhotoPaths,
    subjectNotes,
    diaryDraft,
    localTotalDone,
    totalTarget,
  ]);

  // ========== Supabase 寫入（debounce，避免狂打）==========
  useEffect(() => {
    const t = window.setTimeout(() => {
      (async () => {
        try {
          const res = await saveDailyToSupabase({
            date: dateKey,
            done,
            totalDone: localTotalDone,
            unlocked: totalTarget === 0 ? false : localTotalDone / totalTarget >= 2 / 3,
            partnerMessage: partnerMessageDraft || undefined,
            couplePhotoPath: couplePhotoPath || undefined,
            dailyPhotoPaths: dailyPhotoPaths.length ? dailyPhotoPaths : undefined,

            // ✅ 新增
            subjectNotes: subjectNotes.length ? subjectNotes : undefined,
            diary: diaryDraft || undefined,
          });
          if (res?.error) console.error("[saveDailyToSupabase] error:", res.error);
        } catch (e) {
          console.error("[saveDailyToSupabase] crashed:", e);
        }
      })();
    }, 600);

    return () => window.clearTimeout(t);
  }, [
    dateKey,
    done,
    localTotalDone,
    totalTarget,
    partnerMessageDraft,
    couplePhotoPath,
    dailyPhotoPaths,
    subjectNotes,
    diaryDraft,
  ]);

  // ========== 解鎖瞬間（一天一次彈窗）==========
  useEffect(() => {
    const today = history[dateKey];
    const alreadyShown = !!today?.unlockModalShown;

    if (effectiveUnlocked && !alreadyShown) {
      setShowUnlockModal(true);
      setConfettiOn(true);
      window.setTimeout(() => setConfettiOn(false), 1200);

      setHistory((prev) => {
        const next: HistoryStore = { ...prev };
        next[dateKey] = { ...(next[dateKey] || {}), unlockModalShown: true };
        writeHistory(next);
        return next;
      });
    }
  }, [effectiveUnlocked, history, dateKey]);

  function scrollToUnlock() {
    const el = document.getElementById("unlock-section");
    el?.scrollIntoView({ behavior: "smooth" });
  }

  // ✅ 上傳：合照（單張，覆蓋同一路徑）
  async function uploadCouplePhoto(file: File | null) {
    if (!file) return;
    setUploadingCouple(true);

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) throw new Error("No user session");

      const path = `${user.id}/couple.jpg`;

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type || "image/*",
      });
      if (upErr) throw upErr;

      setCouplePhotoPath(path);
      setCouplePhotoVersion(Date.now()); // ✅ cache bust：覆蓋同一路徑才需要

      // 立刻寫 DB
      await saveDailyToSupabase({
        date: dateKey,
        done,
        totalDone: localTotalDone,
        unlocked: totalTarget === 0 ? false : localTotalDone / totalTarget >= 2 / 3,
        partnerMessage: partnerMessageDraft || undefined,
        couplePhotoPath: path,
        dailyPhotoPaths: dailyPhotoPaths.length ? dailyPhotoPaths : undefined,

        // ✅ 新增
        subjectNotes: subjectNotes.length ? subjectNotes : undefined,
        diary: diaryDraft || undefined,
      });
    } catch (e) {
      console.error("[uploadCouplePhoto] error:", e);
      alert("上傳合照失敗，請看 Console 錯誤訊息。");
    } finally {
      setUploadingCouple(false);
    }
  }

  // ✅ 上傳：今日照片（最多加 6 張）
  async function uploadDailyPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingDaily(true);

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) throw new Error("No user session");

      const maxAdd = Math.min(files.length, 6);
      const newPaths: string[] = [];

      for (let i = 0; i < maxAdd; i++) {
        const f = files[i];
        const filename = safeName(f.name);
        const path = `${user.id}/${dateKey}/daily_${Date.now()}_${i}_${filename}`;

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, {
          upsert: true,
          contentType: f.type || "image/*",
        });
        if (upErr) throw upErr;

        newPaths.push(path);
      }

      const merged = [...newPaths, ...dailyPhotoPaths].slice(0, 24);
      setDailyPhotoPaths(merged);

      // 立刻寫 DB
      await saveDailyToSupabase({
        date: dateKey,
        done,
        totalDone: localTotalDone,
        unlocked: totalTarget === 0 ? false : localTotalDone / totalTarget >= 2 / 3,
        partnerMessage: partnerMessageDraft || undefined,
        couplePhotoPath: couplePhotoPath || undefined,
        dailyPhotoPaths: merged,

        // ✅ 新增
        subjectNotes: subjectNotes.length ? subjectNotes : undefined,
        diary: diaryDraft || undefined,
      });
    } catch (e) {
      console.error("[uploadDailyPhotos] error:", e);
      alert("上傳今日照片失敗，請看 Console 錯誤訊息。");
    } finally {
      setUploadingDaily(false);
    }
  }

  // ✅ 刪除單張今日照片（Storage + DB 同步）
  async function deleteDailyPhoto(path: string) {
    try {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
      if (rmErr) throw rmErr;

      const next = dailyPhotoPaths.filter((p) => p !== path);
      setDailyPhotoPaths(next);

      await saveDailyToSupabase({
        date: dateKey,
        done,
        totalDone: localTotalDone,
        unlocked: totalTarget === 0 ? false : localTotalDone / totalTarget >= 2 / 3,
        partnerMessage: partnerMessageDraft || undefined,
        couplePhotoPath: couplePhotoPath || undefined,
        dailyPhotoPaths: next.length ? next : undefined,

        // ✅ 新增
        subjectNotes: subjectNotes.length ? subjectNotes : undefined,
        diary: diaryDraft || undefined,
      });
    } catch (e) {
      console.error("[deleteDailyPhoto] error:", e);
      alert("刪除失敗，請看 Console 錯誤訊息。");
    }
  }

  const dates = useMemo(() => sortDatesDesc(Object.keys(history)), [history]);

  const coupleImgSrc =
    couplePhotoPath && effectiveUnlocked ? `${publicUrl(couplePhotoPath)}?t=${couplePhotoVersion || 0}` : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-orange-50 text-zinc-900">
      <ConfettiBurst active={confettiOn} />

      {/* 手機底部 tab（拇指友善） */}
      <BottomTabBar tab={tab} setTab={setTab} unlockBadge={unlockBadge} photosBadge={photosBadge} />

      {/* 底部 tab 會蓋住內容，預留空間 */}
      <div className="pb-28">
        <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
          {/* Header */}
          <header className="space-y-2 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white/70 px-4 py-2 text-sm text-rose-700 shadow-sm">
              <span>🌷</span>
              <span>今天也一起穩穩前進</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">陪考日記 · 今日</h1>
            <p className="text-sm text-zinc-600">
              完成 <span className="font-semibold text-rose-700">2/3</span> 即解鎖「鼓勵訊息 / 合照 / 今日照片」✨
            </p>
          </header>

          {/* 桌機 tabs（手機主要用底部 tab） */}
          <nav className="hidden sm:block rounded-3xl border border-rose-200/60 bg-white/70 p-3 shadow-sm">
            <div className="grid grid-cols-4 gap-2">
              <TabButton active={tab === "checkin"} onClick={() => setTab("checkin")} icon="📝" label="打卡" />
              <TabButton active={tab === "unlock"} onClick={() => setTab("unlock")} icon="🎁" label="解鎖" badge={unlockBadge} />
              <TabButton
                active={tab === "photos"}
                onClick={() => setTab("photos")}
                icon="📷"
                label="照片/一句話"
                badge={photosBadge}
              />
              <TabButton active={tab === "history"} onClick={() => setTab("history")} icon="🗓️" label="回顧牆" />
            </div>
          </nav>

          {/* ====== Tab: 打卡 ====== */}
          {tab === "checkin" && (
            <div className="space-y-6">
              {/* 總進度 */}
              <section className="rounded-3xl border border-amber-200/60 bg-white/80 p-5 shadow-sm space-y-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-sm text-zinc-600">今日總完成</div>
                    <div className="text-2xl font-semibold">
                      {localTotalDone.toFixed(1)} / {totalTarget.toFixed(1)} 小時
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-zinc-600">進度</div>
                    <div className="text-2xl font-semibold text-rose-700">
                      {Math.round((totalTarget === 0 ? 0 : localTotalDone / totalTarget) * 100)}%
                    </div>
                  </div>
                </div>

                <div className="h-3 w-full rounded-full bg-rose-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all"
                    style={{
                      width: `${clamp((totalTarget === 0 ? 0 : (localTotalDone / totalTarget) * 100), 0, 100)}%`,
                    }}
                  />
                </div>

                <div className="text-sm">
                  {totalTarget !== 0 && localTotalDone / totalTarget >= 2 / 3 ? (
                    <span className="text-emerald-700 font-medium">✅ 已達成 2/3，解鎖成功！</span>
                  ) : (
                    <span className="text-amber-700">
                      還差{" "}
                      <span className="font-semibold">
                        {Math.max(0, (2 / 3) * totalTarget - localTotalDone).toFixed(1)}
                      </span>{" "}
                      小時就能解鎖
                    </span>
                  )}
                </div>

                {!(totalTarget !== 0 && localTotalDone / totalTarget >= 2 / 3) && (
                  <button
                    className="w-full rounded-2xl bg-rose-600 text-white py-3 font-medium shadow-sm active:scale-[0.99]"
                    onClick={() => setTab("unlock")}
                  >
                    去解鎖頁看看 🎁
                  </button>
                )}
              </section>

              {/* 科目列表 */}
              <section className="rounded-3xl border border-rose-200/60 bg-white/80 p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <h2 className="text-lg font-semibold">今日目標（快速加減 0.5h）</h2>
                  <button
                    className="text-sm rounded-2xl border border-rose-200 bg-white/80 px-4 py-3 font-medium hover:bg-white"
                    onClick={() => {
                      setDone(subjects.map(() => 0));
                      setSubjectNotes(subjects.map(() => ""));
                    }}
                  >
                    全部歸零
                  </button>
                </div>

                <div className="space-y-4">
                  {subjects.map((s, i) => {
                    const d = done[i] || 0;
                    const ratio = d / Number(s.target);

                    return (
                      <div key={s.name} className="rounded-2xl border border-rose-200/60 bg-white/70 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-zinc-900">
                            {s.name} <span className="text-zinc-500 text-sm">目標 {s.target}h</span>
                          </div>
                          <div className="text-sm text-rose-700 font-medium">{Math.round(clamp(ratio, 0, 1) * 100)}%</div>
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
                              setDone((prev) => prev.map((x, idx) => (idx === i ? clamp((x || 0) - 0.5, 0, 99) : x)))
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
                            value={d}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setDone((prev) => prev.map((x, idx) => (idx === i ? (isNaN(v) ? 0 : v) : x)));
                            }}
                          />

                          <button
                            className="rounded-2xl border border-rose-200 bg-white/80 py-3 font-semibold text-rose-700 active:scale-[0.99]"
                            onClick={() =>
                              setDone((prev) => prev.map((x, idx) => (idx === i ? clamp((x || 0) + 0.5, 0, 99) : x)))
                            }
                          >
                            +0.5
                          </button>
                        </div>

                        {/* ✅ 新增：今天讀什麼 */}
                        <div className="rounded-2xl border border-rose-200 bg-white/70 p-3">
                          <div className="text-xs font-medium text-zinc-700">今天讀什麼</div>
                          <textarea
                            className="mt-2 w-full rounded-2xl border border-rose-200 bg-white/90 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
                            rows={2}
                            placeholder="例如：第1章 程序原則／考古題第3回…"
                            value={subjectNotes[i] ?? ""}
                            onChange={(e) =>
                              setSubjectNotes((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
                            }
                          />
                        </div>

                        <div className="text-xs text-zinc-500">小提醒：每次變動會在 0.6 秒後自動同步 Supabase</div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* ====== Tab: 解鎖 ====== */}
          {tab === "unlock" && (
            <div className="space-y-6">
              <section
                id="unlock-section"
                ref={(el) => {
                  unlockSectionRef.current = el;
                }}
                className={`rounded-3xl border p-5 shadow-sm space-y-4 ${
                  effectiveUnlocked ? "border-emerald-200 bg-emerald-50" : "border-rose-200/60 bg-white/80"
                }`}
              >
                <h2 className="text-lg font-semibold">🎁 解鎖區</h2>

                {/* ✅ 不上鎖：每日心得日記 */}
                <div className="rounded-2xl border border-rose-200 bg-white/90 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-zinc-900">📓 今日心得日記（不需解鎖）</div>
                      <div className="text-xs text-zinc-500">不管今天有沒有達標，都可以寫；會同步到 Supabase。</div>
                    </div>
                  </div>

                  <textarea
                    className="mt-3 w-full rounded-2xl border border-rose-200 bg-white/90 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
                    rows={5}
                    placeholder="今天最有收穫的是什麼？遇到的卡點？明天要怎麼更順？"
                    value={diaryDraft}
                    onChange={(e) => setDiaryDraft(e.target.value)}
                  />
                </div>

                {!effectiveUnlocked ? (
                  <div className="space-y-4">
                    <div className="text-sm text-zinc-700 leading-relaxed">
                      完成今日目標 <span className="text-rose-700 font-semibold">2/3</span> 才能看到內容。你已經很努力了，慢慢來也沒關係 🌷
                    </div>

                    <div className="rounded-2xl border border-rose-200 bg-white/70 p-4 text-sm text-amber-700">
                      還差 <span className="font-semibold">{needHoursToUnlock.toFixed(1)}</span> 小時就解鎖囉～我在這裡等你 ✨
                    </div>

                    <button
                      className="w-full rounded-2xl bg-rose-600 text-white py-3 font-medium shadow-sm active:scale-[0.99]"
                      onClick={() => setTab("checkin")}
                    >
                      回去打卡 📝
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-white/90 border border-emerald-200 p-4">
                      <div className="text-sm text-emerald-700 mb-2 font-medium">今日一句話</div>
                      <div className="text-base text-zinc-900 leading-relaxed">
                        {partnerMessageDraft?.trim()
                          ? partnerMessageDraft.trim()
                          : "我看到你今天的努力了，真的很為你驕傲。累了就休息一下，但別忘了你一直都在變強，我會一直陪你 💛"}
                      </div>
                    </div>

                    <button
                      className="w-full rounded-2xl border border-emerald-200 bg-white/90 py-3 font-medium text-emerald-700 active:scale-[0.99]"
                      onClick={() => setTab("photos")}
                    >
                      去看合照與今日照片 📷
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ====== Tab: 照片/一句話 ====== */}
          {tab === "photos" && (
            <div className="space-y-6">
              {/* 合照 */}
              <section className="rounded-3xl border border-rose-200/60 bg-white/80 p-5 shadow-sm space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">兩人合照（永久）</h2>
                    <p className="text-sm text-zinc-600">這張會存在 Supabase Storage（public bucket）→ 永久網址可回顧 💛</p>
                  </div>

                  <label
                    className={`inline-flex cursor-pointer items-center justify-center rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-sm active:scale-[0.99] ${
                      uploadingCouple ? "bg-zinc-400" : "bg-rose-600 hover:bg-rose-700"
                    }`}
                  >
                    {uploadingCouple ? "上傳中..." : "上傳合照"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => uploadCouplePhoto(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-100 to-amber-100">
                  <div className="aspect-[16/9] w-full">
                    {coupleImgSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coupleImgSrc} alt="couple" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-rose-700/70">
                        <div className="text-3xl">📷</div>
                        <div className="text-sm">
                          {couplePhotoPath ? "（未解鎖，合照已保存，達標後就會顯示）" : "在這裡放你們的合照（永久保存）"}
                        </div>
                        <div className="text-xs text-zinc-500">（跨裝置同步 / 永久網址）</div>
                      </div>
                    )}
                  </div>

                  <div className="absolute left-3 top-3 rounded-full bg-white/80 px-3 py-1 text-xs text-rose-700 border border-rose-200">
                    {effectiveUnlocked ? "已解鎖展示" : "解鎖後展示"}
                  </div>
                </div>

                {/* 一句話 */}
                <div className="rounded-2xl border border-rose-200 bg-white/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-zinc-900">今日一句話（同步到 Supabase）</div>
                      <div className="text-xs text-zinc-500">跨裝置都會看到同一份內容 ✨</div>
                    </div>

                    <div
                      className={`text-xs px-2 py-1 rounded-full border ${
                        effectiveUnlocked
                          ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                          : "border-rose-200 text-rose-700 bg-white/50"
                      }`}
                    >
                      {effectiveUnlocked ? "已解鎖" : "未解鎖"}
                    </div>
                  </div>

                  <textarea
                    className="mt-3 w-full rounded-2xl border border-rose-200 bg-white/90 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
                    rows={3}
                    placeholder="例如：今天你真的很棒，我看到你的努力了。慢慢來，我一直在 💛"
                    value={partnerMessageDraft}
                    onChange={(e) => setPartnerMessageDraft(e.target.value)}
                  />

                  {!effectiveUnlocked && <div className="mt-2 text-xs text-zinc-500">（他要完成 2/3 才會看到這句話）</div>}
                </div>
              </section>

              {/* 今日照片 */}
              <section className="rounded-3xl border border-rose-200/60 bg-white/80 p-5 shadow-sm space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">今日照片（永久）</h2>
                    <p className="text-sm text-zinc-600">上傳後會是永久網址，回顧牆跨裝置都能看 🌙</p>
                  </div>

                  <label
                    className={`inline-flex cursor-pointer items-center justify-center rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-sm active:scale-[0.99] ${
                      uploadingDaily ? "bg-zinc-400" : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                  >
                    {uploadingDaily ? "上傳中..." : "上傳今日照片"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => uploadDailyPhotos(e.target.files)}
                    />
                  </label>
                </div>

                {dailyPhotoPaths.length === 0 ? (
                  <div className="rounded-2xl border border-rose-200 bg-white/70 p-4 text-sm text-zinc-600">
                    還沒有照片～上傳 1～3 張，回顧時會很有成就感 ✨
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {dailyPhotoPaths.map((path) => (
                      <div key={path} className="relative overflow-hidden rounded-2xl border border-rose-200 bg-white">
                        <div className="aspect-square">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={publicUrl(path)} alt={path} className="h-full w-full object-cover" />
                        </div>

                        <button
                          className="absolute right-2 top-2 rounded-full bg-white/90 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 active:scale-[0.99]"
                          onClick={() => deleteDailyPhoto(path)}
                        >
                          刪除
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {!effectiveUnlocked && (
                  <div className="text-xs text-zinc-500">
                    小提醒：照片在「解鎖」後會更有儀式感，但你可以先放著，等他完成再一起看 💛
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ====== Tab: 回顧牆 ====== */}
          {tab === "history" && (
            <div className="space-y-6">
              <section className="rounded-3xl border border-rose-200/60 bg-white/80 p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">🗓️ 回顧牆（跨裝置）</h2>
                    <p className="text-sm text-zinc-600">此處會顯示「Supabase 同步回來」的最近 30 天紀錄。</p>
                  </div>

                  <button
                    className="text-sm rounded-2xl border border-rose-200 bg-white/80 px-4 py-3 font-medium hover:bg-white active:scale-[0.99]"
                    onClick={() => {
                      if (!confirm("確定要清空本機回顧快取嗎？（不會刪 Supabase）")) return;
                      localStorage.removeItem("studybuddy_history_v1");
                      setHistory({});
                      setDone(subjects.map(() => 0));
                      setSubjectNotes(subjects.map(() => ""));
                      setDiaryDraft("");
                      setPartnerMessageDraft("");
                      setCouplePhotoPath(null);
                      setDailyPhotoPaths([]);
                    }}
                  >
                    清空本機快取
                  </button>
                </div>

                {dates.length === 0 ? (
                  <div className="rounded-2xl border border-rose-200 bg-white/70 p-4 text-sm text-zinc-600">
                    還沒有紀錄～從今天開始累積，回顧牆會越來越可愛 ✨
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dates.map((d) => {
                      const r = history[d];

                      // ✅ Step B：優先使用 Supabase 的 totalDone/unlocked（更準）
                      const dTotal =
                        typeof r?.totalDone === "number"
                          ? r.totalDone
                          : (r?.done || []).reduce((s, x) => s + (Number(x) || 0), 0);

                      const isUnlock =
                        typeof r?.unlocked === "boolean"
                          ? r.unlocked
                          : totalTarget === 0
                          ? false
                          : dTotal / totalTarget >= 2 / 3;

                      const ratio = totalTarget === 0 ? 0 : dTotal / totalTarget;
                      const photos = r?.dailyPhotoPaths || [];

                      return (
                        <div key={d} className="rounded-2xl border border-rose-200 bg-white/70 p-4 space-y-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="font-medium">
                              {d}{" "}
                              <span
                                className={`ml-2 text-xs px-2 py-1 rounded-full border ${
                                  isUnlock
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-rose-200 bg-white/80 text-rose-700"
                                }`}
                              >
                                {isUnlock ? "已解鎖" : "未解鎖"}
                              </span>
                            </div>

                            <div className="text-sm text-zinc-600">
                              用功 {dTotal.toFixed(1)}h / 目標 {totalTarget.toFixed(1)}h（{Math.round(ratio * 100)}%）
                            </div>
                          </div>

                          {photos.length === 0 ? (
                            <div className="text-sm text-zinc-500">這天沒有照片。</div>
                          ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                              {photos.slice(0, 12).map((path) => (
                                <div key={path} className="overflow-hidden rounded-xl border border-rose-200 bg-white">
                                  <div className="aspect-square">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={publicUrl(path)} alt={path} className="h-full w-full object-cover" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {r?.partnerMessage?.trim() ? (
                            <div className="rounded-2xl border border-rose-200 bg-white/90 p-3 text-sm text-zinc-700">
                              <span className="font-medium text-rose-700">一句話：</span>{" "}
                              {isUnlock ? r.partnerMessage : "（未解鎖，內容保留到你努力達標那刻 💛）"}
                            </div>
                          ) : null}

                          {/* ✅ 加分：回顧牆也顯示日記（不鎖） */}
                          {r?.diary?.trim() ? (
                            <div className="rounded-2xl border border-rose-200 bg-white/90 p-3 text-sm text-zinc-700">
                              <span className="font-medium text-zinc-900">📓 日記：</span> {r.diary}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          <footer className="text-xs text-zinc-500 text-center">
            ✅ 目前照片已改為 Supabase Storage（public bucket）→ 永久 URL 可回顧、可跨裝置同步。
          </footer>
        </div>
      </div>

      {/* 解鎖彈窗 */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowUnlockModal(false)} />
          <div className="relative w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-xl">
            <div className="text-center space-y-2">
              <div className="text-3xl">🎉</div>
              <h3 className="text-xl font-semibold text-zinc-900">解鎖成功！</h3>
              <p className="text-sm text-zinc-600">
                你已完成今日目標的 <span className="font-semibold text-rose-700">2/3</span>，現在可以解鎖「鼓勵訊息 / 合照 /
                今日照片」✨
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="rounded-2xl bg-rose-600 text-white py-3 font-medium shadow-sm hover:bg-rose-700 active:scale-[0.99]"
                onClick={() => {
                  setShowUnlockModal(false);
                  setTab("unlock");
                  setTimeout(() => scrollToUnlock(), 80);
                }}
              >
                🎁 立刻解鎖
              </button>

              <button
                className="rounded-2xl border border-rose-200 bg-white py-3 font-medium hover:bg-rose-50 active:scale-[0.99]"
                onClick={() => setShowUnlockModal(false)}
              >
                晚點再看
              </button>
            </div>

            <div className="mt-4 text-center text-xs text-zinc-500">（點背景也可以關閉）</div>
          </div>
        </div>
      )}
    </main>
  );
}

/** ✅ 寫入 daily_records（包含照片路徑、訊息、done、total_done、unlocked + subject_notes + diary） */
async function saveDailyToSupabase({
  date,
  done,
  totalDone,
  unlocked,
  partnerMessage,
  couplePhotoPath,
  dailyPhotoPaths,
  subjectNotes,
  diary,
}: {
  date: string;
  done: number[];
  totalDone: number;
  unlocked: boolean;
  partnerMessage?: string;
  couplePhotoPath?: string;
  dailyPhotoPaths?: string[];
  subjectNotes?: string[];
  diary?: string;
}) {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return { error: userErr };
  if (!user) return { error: new Error("No user session (not logged in)") };

  const payload: any = {
    user_id: user.id,
    date,
    done,
    total_done: totalDone,
    unlocked,
    partner_message: typeof partnerMessage === "string" ? partnerMessage : null,
    couple_photo_path: typeof couplePhotoPath === "string" ? couplePhotoPath : null,
    daily_photo_paths: Array.isArray(dailyPhotoPaths) ? dailyPhotoPaths : null,

    // ✅ 新增
    subject_notes: Array.isArray(subjectNotes) ? subjectNotes : null,
    diary: typeof diary === "string" ? diary : null,
  };

  const { error } = await supabase.from("daily_records").upsert(payload);
  return { error };
}

/** ✅ 讀取最近 30 天（跨裝置同步） */
async function fetchDailyFromSupabase() {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return { data: null, error: userErr };
  if (!user) return { data: null, error: new Error("No user session") };

  const { data, error } = await supabase
    .from("daily_records")
    .select("date, done, total_done, unlocked, partner_message, couple_photo_path, daily_photo_paths, subject_notes, diary")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(30);

  return { data, error };
}
