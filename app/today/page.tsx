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
];

type DayRecord = {
  done: number[];
  partnerMessage?: string;

  couplePhotoPath?: string;
  dailyPhotoPaths?: string[];

  totalDone?: number;
  unlocked?: boolean;

  dayTarget?: number;

  subjectNotes?: string[];
  diary?: string;

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

function sortDatesDesc(dates: string[]) {
  return dates.slice().sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

function publicUrl(path: string) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function safeName(name: string) {
  const cleaned = name.replace(/[^\w.\-]+/g, "_");
  return cleaned.length ? cleaned : `file_${Date.now()}`;
}

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
              active ? "border-white/50 bg-white/20 text-white" : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {badge}
          </span>
        ) : null}
      </div>
    </button>
  );
}

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

  const [tab, setTab] = useState<TabKey>("checkin");

  const [history, setHistory] = useState<HistoryStore>({});
  const [done, setDone] = useState<number[]>(subjects.map(() => 0));
  const [partnerMessageDraft, setPartnerMessageDraft] = useState<string>("");

  // ✅ 你本來就有，現在真的會用到
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  const [subjectNotes, setSubjectNotes] = useState<string[]>(subjects.map(() => ""));
  const [diaryDraft, setDiaryDraft] = useState<string>("");

  const [couplePhotoPath, setCouplePhotoPath] = useState<string | null>(null);
  const [dailyPhotoPaths, setDailyPhotoPaths] = useState<string[]>([]);

  const [couplePhotoVersion, setCouplePhotoVersion] = useState<number>(0);

  const [uploadingCouple, setUploadingCouple] = useState(false);
  const [uploadingDaily, setUploadingDaily] = useState(false);

  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [confettiOn, setConfettiOn] = useState(false);

  const [allTimeTotal, setAllTimeTotal] = useState<number | null>(null);
  const [totalLabel, setTotalLabel] = useState<string>("近30天總時數");

  // ====== 計算（今天）======
  const totalTargetNow = useMemo(() => subjects.reduce((s, x) => s + Number(x.target || 0), 0), []);
  const localTotalDone = useMemo(() => done.reduce((sum, h) => sum + (Number(h) || 0), 0), [done]);

  const todayFromHistory = history[dateKey];
  const effectiveTotalDone = typeof todayFromHistory?.totalDone === "number" ? todayFromHistory.totalDone : localTotalDone;

  const todayDayTarget = typeof todayFromHistory?.dayTarget === "number" ? todayFromHistory.dayTarget : totalTargetNow;

  const effectiveUnlocked = todayDayTarget === 0 ? false : effectiveTotalDone / todayDayTarget >= 2 / 3;
  const needHoursToUnlock = Math.max(0, (2 / 3) * todayDayTarget - effectiveTotalDone);

  const unlockBadge = effectiveUnlocked ? "已解鎖" : `差 ${needHoursToUnlock.toFixed(1)}h`;
  const photosBadge = dailyPhotoPaths.length ? `${dailyPhotoPaths.length}張` : undefined;

  // ✅ 初始化：抓自己的 couple_id / role
  useEffect(() => {
    (async () => {
      const { profile, error } = await getMyProfile();
      if (error) {
        console.error("[getMyProfile] error:", error);
        return;
      }
      setCoupleId(profile?.couple_id ?? null);
      setMyRole(profile?.role ?? null);
    })();
  }, []);

  // ========== Step A：先讀本機 ==========
  useEffect(() => {
    const store = readHistory();
    setHistory(store);

    const today = store[dateKey];
    if (today?.done?.length) setDone(today.done);
    if (typeof today?.partnerMessage === "string") setPartnerMessageDraft(today.partnerMessage);
    if (typeof today?.couplePhotoPath === "string") setCouplePhotoPath(today.couplePhotoPath);
    if (Array.isArray(today?.dailyPhotoPaths)) setDailyPhotoPaths(today.dailyPhotoPaths);

    if (Array.isArray(today?.subjectNotes)) {
      const padded = subjects.map((_, i) => String(today.subjectNotes?.[i] ?? ""));
      setSubjectNotes(padded);
    }

    if (typeof today?.diary === "string") setDiaryDraft(today.diary);
  }, [dateKey]);

  // ========== Step A：再從 Supabase 同步近 30 天 ==========
  useEffect(() => {
    // ✅ 等 coupleId 有了才同步（不然會查不到）
    if (!coupleId) return;

    (async () => {
      const { data, error } = await fetchDailyFromSupabase(coupleId);
      if (error) {
        console.error("[fetchDailyFromSupabase] error:", error);
        return;
      }
      if (!data) return;

      setHistory((prev) => {
        const next: HistoryStore = { ...prev };

        for (const row of data as any[]) {
          next[row.date] = {
            ...(next[row.date] || {}),
            done: Array.isArray(row.done) ? row.done : subjects.map(() => 0),
            totalDone: typeof row.total_done === "number" ? row.total_done : next[row.date]?.totalDone,
            unlocked: typeof row.unlocked === "boolean" ? row.unlocked : next[row.date]?.unlocked,
            dayTarget: typeof row.day_target === "number" ? row.day_target : next[row.date]?.dayTarget,

            partnerMessage: typeof row.partner_message === "string" ? row.partner_message : next[row.date]?.partnerMessage,
            couplePhotoPath:
              typeof row.couple_photo_path === "string" ? row.couple_photo_path : next[row.date]?.couplePhotoPath,
            dailyPhotoPaths: Array.isArray(row.daily_photo_paths) ? row.daily_photo_paths : next[row.date]?.dailyPhotoPaths,

            subjectNotes: Array.isArray(row.subject_notes)
              ? row.subject_notes.map((x: any) => String(x ?? ""))
              : next[row.date]?.subjectNotes,
            diary: typeof row.diary === "string" ? row.diary : next[row.date]?.diary,
          };
        }

        writeHistory(next);
        return next;
      });

      // ✅ 統計總時數：改成吃 couple_id（需要你建立 RPC，我下面會給 SQL）
      try {
        const { data: sumData, error: sumErr } = await supabase.rpc("get_total_done_sum", { p_couple_id: coupleId });
        if (!sumErr) {
          setAllTimeTotal(Number(sumData ?? 0));
          setTotalLabel("統計以來總時數");
        } else {
          const sum30 = (data as any[]).reduce((acc, r) => acc + (Number(r.total_done) || 0), 0);
          setAllTimeTotal(sum30);
          setTotalLabel("近30天總時數");
        }
      } catch {
        const sum30 = (data as any[]).reduce((acc, r) => acc + (Number(r.total_done) || 0), 0);
        setAllTimeTotal(sum30);
        setTotalLabel("近30天總時數");
      }

      const todayRow = (data as any[]).find((x) => x.date === dateKey);
      if (todayRow) {
        if (Array.isArray(todayRow.done)) setDone(todayRow.done);
        if (typeof todayRow.partner_message === "string") setPartnerMessageDraft(todayRow.partner_message);
        if (typeof todayRow.couple_photo_path === "string") setCouplePhotoPath(todayRow.couple_photo_path);
        if (Array.isArray(todayRow.daily_photo_paths)) setDailyPhotoPaths(todayRow.daily_photo_paths);

        if (Array.isArray(todayRow.subject_notes)) {
          const padded = subjects.map((_, i) => String(todayRow.subject_notes?.[i] ?? ""));
          setSubjectNotes(padded);
        }

        if (typeof todayRow.diary === "string") setDiaryDraft(todayRow.diary);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, coupleId]);

  useEffect(() => {
    if (couplePhotoPath) setCouplePhotoVersion(Date.now());
  }, [couplePhotoPath]);

  // ========== 本機快取 ==========
  useEffect(() => {
    setHistory((prev) => {
      const next: HistoryStore = { ...prev };
      next[dateKey] = {
        ...(next[dateKey] || {}),
        done,
        partnerMessage: partnerMessageDraft || undefined,
        couplePhotoPath: couplePhotoPath || undefined,
        dailyPhotoPaths: dailyPhotoPaths.length ? dailyPhotoPaths : undefined,

        subjectNotes: subjectNotes.length ? subjectNotes : undefined,
        diary: diaryDraft || undefined,

        totalDone: localTotalDone,
        dayTarget: totalTargetNow,

        unlocked:
          typeof next[dateKey]?.unlocked === "boolean"
            ? next[dateKey]!.unlocked
            : totalTargetNow === 0
            ? false
            : localTotalDone / totalTargetNow >= 2 / 3,

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
    totalTargetNow,
  ]);

  // ========== Supabase 寫入 ==========
  useEffect(() => {
    if (!coupleId) return; // ✅ 沒 coupleId 不寫

    const t = window.setTimeout(() => {
      (async () => {
        try {
          const res = await saveDailyToSupabase({
            coupleId,
            date: dateKey,
            done,
            totalDone: localTotalDone,
            dayTarget: totalTargetNow,
            unlocked: totalTargetNow === 0 ? false : localTotalDone / totalTargetNow >= 2 / 3,
            partnerMessage: partnerMessageDraft || undefined,
            couplePhotoPath: couplePhotoPath || undefined,
            dailyPhotoPaths: dailyPhotoPaths.length ? dailyPhotoPaths : undefined,
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
    coupleId,
    dateKey,
    done,
    localTotalDone,
    totalTargetNow,
    partnerMessageDraft,
    couplePhotoPath,
    dailyPhotoPaths,
    subjectNotes,
    diaryDraft,
  ]);

  // ========== 解鎖彈窗 ==========
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

  // ✅ 上傳：合照（改用 couple_id folder）
  async function uploadCouplePhoto(file: File | null) {
    if (!file) return;
    if (!coupleId) return alert("尚未取得 coupleId，請重新整理頁面。");

    setUploadingCouple(true);

    try {
      const path = `${coupleId}/couple.jpg`;

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type || "image/*",
      });
      if (upErr) throw upErr;

      setCouplePhotoPath(path);
      setCouplePhotoVersion(Date.now());

      await saveDailyToSupabase({
        coupleId,
        date: dateKey,
        done,
        totalDone: localTotalDone,
        dayTarget: totalTargetNow,
        unlocked: totalTargetNow === 0 ? false : localTotalDone / totalTargetNow >= 2 / 3,
        partnerMessage: partnerMessageDraft || undefined,
        couplePhotoPath: path,
        dailyPhotoPaths: dailyPhotoPaths.length ? dailyPhotoPaths : undefined,
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

  // ✅ 上傳：今日照片（改用 couple_id folder）
  async function uploadDailyPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!coupleId) return alert("尚未取得 coupleId，請重新整理頁面。");

    setUploadingDaily(true);

    try {
      const maxAdd = Math.min(files.length, 6);
      const newPaths: string[] = [];

      for (let i = 0; i < maxAdd; i++) {
        const f = files[i];
        const filename = safeName(f.name);
        const path = `${coupleId}/${dateKey}/daily_${Date.now()}_${i}_${filename}`;

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, {
          upsert: true,
          contentType: f.type || "image/*",
        });
        if (upErr) throw upErr;

        newPaths.push(path);
      }

      const merged = [...newPaths, ...dailyPhotoPaths].slice(0, 24);
      setDailyPhotoPaths(merged);

      await saveDailyToSupabase({
        coupleId,
        date: dateKey,
        done,
        totalDone: localTotalDone,
        dayTarget: totalTargetNow,
        unlocked: totalTargetNow === 0 ? false : localTotalDone / totalTargetNow >= 2 / 3,
        partnerMessage: partnerMessageDraft || undefined,
        couplePhotoPath: couplePhotoPath || undefined,
        dailyPhotoPaths: merged,
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

  async function deleteDailyPhoto(path: string) {
    if (!coupleId) return alert("尚未取得 coupleId，請重新整理頁面。");

    try {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
      if (rmErr) throw rmErr;

      const next = dailyPhotoPaths.filter((p) => p !== path);
      setDailyPhotoPaths(next);

      await saveDailyToSupabase({
        coupleId,
        date: dateKey,
        done,
        totalDone: localTotalDone,
        dayTarget: totalTargetNow,
        unlocked: totalTargetNow === 0 ? false : localTotalDone / totalTargetNow >= 2 / 3,
        partnerMessage: partnerMessageDraft || undefined,
        couplePhotoPath: couplePhotoPath || undefined,
        dailyPhotoPaths: next.length ? next : undefined,
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

  // ====== UI（下面你原本的 JSX 我不動，省略）======
  // ✅ 你貼的 UI 很長，我這裡不重複貼，請保留你原本 return(...) 的內容即可。
  // ✅ 唯一要改的是：你檔案內的 return(...) 下面那段 UI，直接用你現在的那段，完全不用動。

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-orange-50 text-zinc-900">
      {/* 你的 UI 原封不動貼回來即可 */}
      {/* 為了避免我在這裡重複一大段 UI，請你把你原本 return(...) 的 JSX 直接放回來 */}
      <div className="p-6 text-sm text-zinc-600">
        ✅ 已套用 couple_id 共享版程式。請把你原本的 UI return(...) 貼回來即可（UI 不需改）。
        <div className="mt-2">
          coupleId: <span className="font-mono">{coupleId ?? "(loading...)"}</span> / role:{" "}
          <span className="font-mono">{myRole ?? "(loading...)"}</span>
        </div>
      </div>
    </main>
  );
}

/** ✅ 寫入：改成用 couple_id 當主鍵（couple_id + date） */
async function saveDailyToSupabase({
  coupleId,
  date,
  done,
  totalDone,
  dayTarget,
  unlocked,
  partnerMessage,
  couplePhotoPath,
  dailyPhotoPaths,
  subjectNotes,
  diary,
}: {
  coupleId: string;
  date: string;
  done: number[];
  totalDone: number;
  dayTarget: number;
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
    couple_id: coupleId,
    date,
    done,
    total_done: totalDone,
    day_target: dayTarget,
    unlocked,
    partner_message: typeof partnerMessage === "string" ? partnerMessage : null,
    couple_photo_path: typeof couplePhotoPath === "string" ? couplePhotoPath : null,
    daily_photo_paths: Array.isArray(dailyPhotoPaths) ? dailyPhotoPaths : null,
    subject_notes: Array.isArray(subjectNotes) ? subjectNotes : null,
    diary: typeof diary === "string" ? diary : null,

    // ✅ 建議保留：最後是誰改的（可選）
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("daily_records").upsert(payload);
  return { error };
}

/** ✅ 讀取：改成用 couple_id */
async function fetchDailyFromSupabase(coupleId: string) {
  const { data, error } = await supabase
    .from("daily_records")
    .select(
      "date, done, total_done, unlocked, day_target, partner_message, couple_photo_path, daily_photo_paths, subject_notes, diary"
    )
    .eq("couple_id", coupleId)
    .order("date", { ascending: false })
    .limit(30);

  return { data, error };
}

/** ✅ 取自己的 couple_id / role */
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
    .single();

  return { profile: data, error };
}
