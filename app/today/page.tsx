"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";

const BUCKET = "daily-photos";

const subjects = [
  { name: "行政法", target: 3 },
  { name: "行政學", target: 2 },
  { name: "刑訴法", target: 3 },
  { name: "刑法", target: 1.5 },
  { name: "公務員法", target: 1 },
  { name: "憲法", target: 0.5 },
] as const;

type Role = "supporter" | "writer";

type DayRecord = {
  done: number[];
  totalDone?: number;
  unlocked?: boolean;

  // ✅ 新增：回顧牆顯示對方用功時數
  partnerTotalDone?: number;

  // 只用於本機回顧牆顯示（會從 study_progress + day_content + day_open_content 合併）
  partnerMessage?: string;
  couplePhotoPath?: string;
  dailyPhotoPaths?: string[];

  // ✅ 公開內容（兩人永遠互看）
  myStudyNotes?: string[];
  partnerStudyNotes?: string[];
  myDiary?: string;
  partnerDiary?: string;

  unlockModalShown?: boolean;
};

type HistoryStore = Record<string, DayRecord>;
type TabKey = "checkin" | "unlock" | "photos" | "history";

type ContentRow = {
  couple_id: string;
  date: string;
  author_id: string;
  author_role: Role;
  partner_message: string | null;
  couple_photo_path: string | null;
  daily_photo_paths: string[] | null;
};

type OpenRow = {
  couple_id: string;
  date: string;
  author_id: string;
  author_role: Role;
  study_notes: string[] | null;
  unlock_diary: string | null;
};

type ProgressRow = {
  user_id: string;
  couple_id: string;
  date: string;
  done: number[] | null;
  total_done: number | null;
  unlocked: boolean | null;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayISO() {
  return toISODate(new Date());
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toISODate(d);
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

  // ✅ couple 分享核心
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  // ✅ 我的內容（照片/一句話：受解鎖規則影響）
  const [myMessageDraft, setMyMessageDraft] = useState<string>("");
  const [myCouplePhotoPath, setMyCouplePhotoPath] = useState<string | null>(null);
  const [myDailyPhotoPaths, setMyDailyPhotoPaths] = useState<string[]>([]);

  // ✅ 對方內容（照片/一句話：writer 未解鎖時可能拿不到）
  const [partnerMessage, setPartnerMessage] = useState<string>("");
  const [partnerCouplePhotoPath, setPartnerCouplePhotoPath] = useState<string | null>(null);
  const [partnerDailyPhotoPaths, setPartnerDailyPhotoPaths] = useState<string[]>([]);

  // ✅ 公開內容（永遠互看）
  const [myStudyNotes, setMyStudyNotes] = useState<string[]>(subjects.map(() => ""));
  const [partnerStudyNotes, setPartnerStudyNotes] = useState<string[]>(subjects.map(() => ""));
  const [myDiaryDraft, setMyDiaryDraft] = useState<string>("");
  const [partnerDiary, setPartnerDiary] = useState<string>("");

  const [couplePhotoVersion, setCouplePhotoVersion] = useState<number>(0);

  const [uploadingCouple, setUploadingCouple] = useState(false);
  const [uploadingDaily, setUploadingDaily] = useState(false);

  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [confettiOn, setConfettiOn] = useState(false);

  const router = useRouter();

  // ✅ 登入檢查
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.replace("/login");
    })();
  }, [router]);

  const totalTarget = useMemo(() => subjects.reduce((s, x) => s + x.target, 0), []);
  const localTotalDone = useMemo(() => done.reduce((sum, h) => sum + (Number(h) || 0), 0), [done]);

  // ✅ 解鎖規則：supporter 永遠解鎖；writer 以自己打卡達 2/3 為準
  const effectiveUnlocked =
    myRole === "supporter"
      ? true
      : totalTarget === 0
      ? false
      : localTotalDone / totalTarget >= 2 / 3;

  const needHoursToUnlock = Math.max(0, (2 / 3) * totalTarget - localTotalDone);
  const unlockBadge = effectiveUnlocked ? "已解鎖" : `差 ${needHoursToUnlock.toFixed(1)}h`;

  // ✅ Photos badge：顯示「我自己的今日照片數」
  const photosBadge = myDailyPhotoPaths.length ? `${myDailyPhotoPaths.length}張` : undefined;

  // ✅ 0) 取得 profile + user id
  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id ?? null;
      setMyUserId(uid);

      const { profile, error } = await getMyProfile();
      if (error) {
        console.error("[getMyProfile] error:", error);
        return;
      }
      setCoupleId(profile?.couple_id ?? null);
      setMyRole((profile?.role as Role) ?? null);
    })();
  }, []);

  // 1) 讀本機快取（只讀進度，不讀內容，內容以 DB 為準）
  useEffect(() => {
    const store = readHistory();
    setHistory(store);

    const today = store[dateKey];
    if (today?.done?.length) setDone(today.done);
  }, [dateKey]);

  // 2) 讀取：近 30 天「雙方進度」(study_progress) + 今天內容(day_content) + 近 30 天公開內容(day_open_content)
  useEffect(() => {
    if (!coupleId || !myUserId || !myRole) return;

    (async () => {
      const fromDate = isoDaysAgo(29);

      // 2-1) 抓「雙方」進度（回顧牆/同步）
      const { data: prog, error: progErr } = await fetchCoupleProgress(coupleId, fromDate);
      if (progErr) console.error("[fetchCoupleProgress] error:", progErr);

      if (Array.isArray(prog)) {
        // by date: mine/other
        const byDate: Record<string, { mine?: ProgressRow; other?: ProgressRow }> = {};
        for (const row of prog as ProgressRow[]) {
          const d = row.date;
          if (!byDate[d]) byDate[d] = {};
          if (row.user_id === myUserId) byDate[d].mine = row;
          else byDate[d].other = row;
        }

        setHistory((prev) => {
          const next: HistoryStore = { ...prev };

          for (const d of Object.keys(byDate)) {
            const ex = next[d] || { done: subjects.map(() => 0) };
            const mine = byDate[d].mine;
            const other = byDate[d].other;

            next[d] = {
              ...ex,
              done: mine?.done && Array.isArray(mine.done) ? mine.done : ex.done || subjects.map(() => 0),
              totalDone:
                typeof mine?.total_done === "number"
                  ? mine.total_done
                  : typeof ex.totalDone === "number"
                  ? ex.totalDone
                  : (ex.done || []).reduce((s, x) => s + (Number(x) || 0), 0),
              unlocked:
                typeof mine?.unlocked === "boolean" ? mine.unlocked : typeof ex.unlocked === "boolean" ? ex.unlocked : undefined,
              partnerTotalDone:
                typeof other?.total_done === "number" ? other.total_done : typeof ex.partnerTotalDone === "number" ? ex.partnerTotalDone : undefined,
              unlockModalShown: ex.unlockModalShown ?? false,
            };
          }

          writeHistory(next);
          return next;
        });

        const todayMine = (prog as ProgressRow[]).find((x) => x.date === dateKey && x.user_id === myUserId);
        if (todayMine?.done && Array.isArray(todayMine.done)) setDone(todayMine.done);
      }

      // 2-2) 抓今天內容（照片/一句話：RLS 會自動過濾）
      const { data: rows, error: contErr } = await fetchDayContent(coupleId, dateKey);
      if (contErr) {
        console.error("[fetchDayContent] error:", contErr);
        return;
      }

      const mine = (rows || []).find((r) => r.author_id === myUserId) ?? null;
      const other = (rows || []).find((r) => r.author_id !== myUserId) ?? null;

      // 我的內容 → UI 可編輯
      setMyMessageDraft(mine?.partner_message ?? "");
      setMyCouplePhotoPath(mine?.couple_photo_path ?? null);
      setMyDailyPhotoPaths(Array.isArray(mine?.daily_photo_paths) ? mine!.daily_photo_paths! : []);

      // 對方內容 → UI 顯示（writer 未解鎖時 other 會是 null）
      setPartnerMessage(other?.partner_message ?? "");
      setPartnerCouplePhotoPath(other?.couple_photo_path ?? null);
      setPartnerDailyPhotoPaths(Array.isArray(other?.daily_photo_paths) ? other!.daily_photo_paths! : []);

      // 讓回顧牆也能顯示「對方內容（若看得到）」：合併進 history
      setHistory((prev) => {
        const next: HistoryStore = { ...prev };
        const ex = next[dateKey] || { done: subjects.map(() => 0) };

        next[dateKey] = {
          ...ex,
          partnerMessage: other?.partner_message ?? ex.partnerMessage,
          couplePhotoPath: other?.couple_photo_path ?? ex.couplePhotoPath,
          dailyPhotoPaths: Array.isArray(other?.daily_photo_paths) ? other!.daily_photo_paths! : ex.dailyPhotoPaths,
        };
        writeHistory(next);
        return next;
      });

      // 2-3) 抓「近 30 天」公開內容（讀什麼/心得：永遠互看）
      const { data: openRows, error: openErr } = await fetchOpenContentRange(coupleId, fromDate);
      if (openErr) console.error("[fetchOpenContentRange] error:", openErr);

      if (Array.isArray(openRows)) {
        const todayMine = openRows.find((r) => r.date === dateKey && r.author_id === myUserId) ?? null;
        const todayOther = openRows.find((r) => r.date === dateKey && r.author_id !== myUserId) ?? null;

        setMyStudyNotes(normalizeStudyNotes(todayMine?.study_notes));
        setPartnerStudyNotes(normalizeStudyNotes(todayOther?.study_notes));
        setMyDiaryDraft(todayMine?.unlock_diary ?? "");
        setPartnerDiary(todayOther?.unlock_diary ?? "");

        // merge into history
        setHistory((prev) => {
          const next: HistoryStore = { ...prev };

          for (const r of openRows) {
            const d = r.date;
            const ex = next[d] || { done: subjects.map(() => 0) };

            const isMine = r.author_id === myUserId;
            next[d] = {
              ...ex,
              myStudyNotes: isMine ? normalizeStudyNotes(r.study_notes) : ex.myStudyNotes,
              partnerStudyNotes: !isMine ? normalizeStudyNotes(r.study_notes) : ex.partnerStudyNotes,
              myDiary: isMine ? (r.unlock_diary ?? "") : ex.myDiary,
              partnerDiary: !isMine ? (r.unlock_diary ?? "") : ex.partnerDiary,
            };
          }

          writeHistory(next);
          return next;
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupleId, myUserId, myRole, dateKey]);

  useEffect(() => {
    setCouplePhotoVersion(Date.now());
  }, [myCouplePhotoPath, partnerCouplePhotoPath]);

  // 3) 本機快取：只存「我自己的進度」+ unlockModalShown
  useEffect(() => {
    setHistory((prev) => {
      const next: HistoryStore = { ...prev };
      next[dateKey] = {
        ...(next[dateKey] || {}),
        done,
        totalDone: localTotalDone,
        unlocked: effectiveUnlocked,
        unlockModalShown: next[dateKey]?.unlockModalShown ?? false,
      };
      writeHistory(next);
      return next;
    });
  }, [dateKey, done, localTotalDone, effectiveUnlocked]);

  // 4) Supabase 寫入：只寫我的進度（study_progress）
  useEffect(() => {
    if (!coupleId || !myUserId) return;

    const t = window.setTimeout(() => {
      (async () => {
        try {
          const res = await saveMyProgress({
            coupleId,
            date: dateKey,
            done,
            totalDone: localTotalDone,
            unlocked: effectiveUnlocked,
          });
          if (res?.error) console.error("[saveMyProgress] error:", res.error);
        } catch (e) {
          console.error("[saveMyProgress] crashed:", e);
        }
      })();
    }, 600);

    return () => window.clearTimeout(t);
  }, [coupleId, myUserId, dateKey, done, localTotalDone, effectiveUnlocked]);

  // 5) 解鎖彈窗
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

  async function handleLogout() {
    await supabase.auth.signOut();
    localStorage.removeItem("sb_name");
    localStorage.removeItem("sb_role_hint");
    location.href = "/login";
  }

  // ================
  // ✅ 上傳 / 刪除（照片/一句話）
  // ================
  async function uploadCouplePhoto(file: File | null) {
    if (!file) return;
    if (!coupleId || !myRole) return alert("尚未取得 coupleId/role，請重新整理頁面。");

    setUploadingCouple(true);
    try {
      const path = `${coupleId}/couple_${myRole}.jpg`;

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type || "image/*",
      });
      if (upErr) throw upErr;

      setMyCouplePhotoPath(path);
      setCouplePhotoVersion(Date.now());

      await saveMyContent({
        coupleId,
        date: dateKey,
        myRole,
        partnerMessage: myMessageDraft || undefined,
        couplePhotoPath: path,
        dailyPhotoPaths: myDailyPhotoPaths.length ? myDailyPhotoPaths : undefined,
      });
    } catch (e) {
      console.error("[uploadCouplePhoto] error:", e);
      alert("上傳合照失敗，請看 Console 錯誤訊息。");
    } finally {
      setUploadingCouple(false);
    }
  }

  async function uploadDailyPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!coupleId || !myRole) return alert("尚未取得 coupleId/role，請重新整理頁面。");

    setUploadingDaily(true);
    try {
      const maxAdd = Math.min(files.length, 6);
      const newPaths: string[] = [];

      for (let i = 0; i < maxAdd; i++) {
        const f = files[i];
        const filename = safeName(f.name);
        const path = `${coupleId}/${dateKey}/${myRole}/daily_${Date.now()}_${i}_${filename}`;

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, {
          upsert: true,
          contentType: f.type || "image/*",
        });
        if (upErr) throw upErr;

        newPaths.push(path);
      }

      const merged = [...newPaths, ...myDailyPhotoPaths].slice(0, 24);
      setMyDailyPhotoPaths(merged);

      await saveMyContent({
        coupleId,
        date: dateKey,
        myRole,
        partnerMessage: myMessageDraft || undefined,
        couplePhotoPath: myCouplePhotoPath || undefined,
        dailyPhotoPaths: merged,
      });
    } catch (e) {
      console.error("[uploadDailyPhotos] error:", e);
      alert("上傳今日照片失敗，請看 Console 錯誤訊息。");
    } finally {
      setUploadingDaily(false);
    }
  }

  async function deleteDailyPhoto(path: string) {
    if (!coupleId || !myRole) return alert("尚未取得 coupleId/role，請重新整理頁面。");

    try {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
      if (rmErr) throw rmErr;

      const next = myDailyPhotoPaths.filter((p) => p !== path);
      setMyDailyPhotoPaths(next);

      await saveMyContent({
        coupleId,
        date: dateKey,
        myRole,
        partnerMessage: myMessageDraft || undefined,
        couplePhotoPath: myCouplePhotoPath || undefined,
        dailyPhotoPaths: next.length ? next : undefined,
      });
    } catch (e) {
      console.error("[deleteDailyPhoto] error:", e);
      alert("刪除失敗，請看 Console 錯誤訊息。");
    }
  }

  // ✅ 顯示：supporter 永遠能看對方；writer 要解鎖才看得到對方（今日照片/一句話）
  const canSeePartner = myRole === "supporter" || effectiveUnlocked;

  // ✅ 合照：兩人「永遠可看」，不受解鎖影響
  const displayCouplePathAlways = partnerCouplePhotoPath || myCouplePhotoPath;
  const coupleImgSrc = displayCouplePathAlways ? `${publicUrl(displayCouplePathAlways)}?t=${couplePhotoVersion || 0}` : null;

  // ✅ 今日照片顯示策略（仍受解鎖影響）
  const displayDailyPhotos =
    myRole === "writer" && !effectiveUnlocked
      ? myDailyPhotoPaths
      : partnerDailyPhotoPaths.length
      ? partnerDailyPhotoPaths
      : myDailyPhotoPaths;

  // ✅ unlock tab 顯示的一句話（顯示對方鼓勵）
  const unlockMessageText =
    canSeePartner && partnerMessage.trim()
      ? partnerMessage.trim()
      : canSeePartner
      ? "我看到你今天的努力了，真的很為你驕傲。累了就休息一下，但別忘了你一直都在變強，我會一直陪你 💛"
      : "（未解鎖：達到 2/3 後就能看到 rueiyu 給你的內容 💛）";

  const dates = useMemo(() => sortDatesDesc(Object.keys(history)), [history]);

  // ✅ 回顧牆累計（近30天：以目前載入的 history 為準）
  const historyTotals = useMemo(() => {
    let my = 0;
    let pt = 0;

    for (const d of Object.keys(history)) {
      const r = history[d];
      const mine =
        typeof r?.totalDone === "number" ? r.totalDone : (r?.done || []).reduce((s, x) => s + (Number(x) || 0), 0);
      my += Number(mine || 0);
      pt += Number(r?.partnerTotalDone || 0);
    }

    return { my, pt, both: my + pt };
  }, [history]);

  // ✅ 小工具：存公開內容（讀什麼/心得）
  async function saveOpenNow(nextStudyNotes?: string[], nextDiary?: string) {
    if (!coupleId || !myRole) return;
    await saveMyOpenContent({
      coupleId,
      date: dateKey,
      myRole,
      studyNotes: Array.isArray(nextStudyNotes) ? nextStudyNotes : myStudyNotes,
      unlockDiary: typeof nextDiary === "string" ? nextDiary : myDiaryDraft,
    });
  }

  // =======================
  // ✅ UI
  // =======================
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-orange-50 text-zinc-900">
      <ConfettiBurst active={confettiOn} />

      <BottomTabBar tab={tab} setTab={setTab} unlockBadge={unlockBadge} photosBadge={photosBadge} />

      <div className="pb-28">
        <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
          <header className="relative space-y-2 text-center">
            <div className="absolute right-4 top-4">
              <button
                onClick={handleLogout}
                className="rounded-2xl border border-rose-200 bg-white/80 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-white active:scale-[0.99]"
              >
                登出
              </button>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white/70 px-4 py-2 text-sm text-rose-700 shadow-sm">
              <span>🌷</span>
              <span>今天也一起穩穩前進</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">陪考日記 · 今日</h1>
            <p className="text-sm text-zinc-600">
              ✨完成 <span className="font-semibold text-rose-700">2/3</span> 即解鎖「鼓勵訊息 / 今日照片」✨
            </p>

            <p className="text-xs text-zinc-500 mt-2">
              coupleId: <span className="font-mono">{coupleId ?? "(loading)"}</span> / role:{" "}
              <span className="font-mono">{myRole ?? "(loading)"}</span>
            </p>
          </header>

          <footer className="text-2xl text-zinc-800 text-center">💫 星光不負趕路者 💫</footer>

          <nav className="hidden sm:block rounded-3xl border border-rose-200/60 bg-white/70 p-3 shadow-sm">
            <div className="grid grid-cols-4 gap-2">
              <TabButton active={tab === "checkin"} onClick={() => setTab("checkin")} icon="📝" label="打卡" />
              <TabButton active={tab === "unlock"} onClick={() => setTab("unlock")} icon="🎁" label="解鎖" badge={unlockBadge} />
              <TabButton
                active={tab === "photos"}
                onClick={() => setTab("photos")}
                icon="📷"
                label="今日照片"
                badge={photosBadge}
              />
              <TabButton active={tab === "history"} onClick={() => setTab("history")} icon="🗓️" label="回顧牆" />
            </div>
          </nav>

          {/* Tab: 打卡 */}
          {tab === "checkin" && (
            <div className="space-y-6">
              {/* ✅ 這一塊照你截圖調整：左側內容置中 + 右側合照（永遠可看） */}
              <section className="rounded-3xl border border-amber-200/60 bg-white/80 p-5 shadow-sm">
                <div className="grid gap-5 sm:grid-cols-[1fr_280px] items-stretch">
                  {/* 左：總完成（垂直置中，不要頂在上面） */}
                  <div className="flex flex-col justify-center min-h-[220px]">
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

                    {/* 進度條不要太長：限制寬度 */}
                    <div className="mt-4 max-w-[520px]">
                      <div className="h-3 w-full rounded-full bg-rose-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all"
                          style={{
                            width: `${clamp(totalTarget === 0 ? 0 : (localTotalDone / totalTarget) * 100, 0, 100)}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 text-sm">
                      {totalTarget !== 0 && localTotalDone / totalTarget >= 2 / 3 ? (
                        <span className="text-emerald-700 font-medium">✅ 已達成 2/3，解鎖成功！</span>
                      ) : (
                        <span className="text-amber-700">
                          還差{" "}
                          <span className="font-semibold">{Math.max(0, (2 / 3) * totalTarget - localTotalDone).toFixed(1)}</span>{" "}
                          小時就能解鎖
                        </span>
                      )}
                    </div>

                    {!(totalTarget !== 0 && localTotalDone / totalTarget >= 2 / 3) && (
                      <button
                        className="mt-4 w-full max-w-[520px] rounded-2xl bg-rose-600 text-white py-3 font-medium shadow-sm active:scale-[0.99]"
                        onClick={() => setTab("unlock")}
                      >
                        去解鎖頁看看 🎁
                      </button>
                    )}
                  </div>

                  {/* 右：合照（永遠可看 + 照片比例自適應） */}
                  <div className="rounded-3xl border border-rose-200 bg-white/80 p-4 shadow-sm flex flex-col">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-semibold text-zinc-900 flex items-center gap-2">
                        <span>🫶</span>
                        <span>合照</span>
                      </div>

                      <label
                        className={`inline-flex cursor-pointer items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-white shadow-sm active:scale-[0.99] ${
                          uploadingCouple ? "bg-zinc-400" : "bg-rose-600 hover:bg-rose-700"
                        }`}
                      >
                        {uploadingCouple ? "上傳中..." : "上傳"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => uploadCouplePhoto(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-rose-200 bg-white/90 p-3 flex-1">
                      {coupleImgSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={coupleImgSrc}
                          alt="couple"
                          className="w-full h-auto rounded-xl"
                        />
                      ) : (
                        <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-rose-700/70">
                          <div className="text-3xl">📷</div>
                          <div className="text-sm">在這裡放你們的合照（永久保存）</div>
                          <div className="text-xs text-zinc-500">（不受解鎖影響，兩人都看得到）</div>
                        </div>
                      )}
                    </div>

                    <div className="mt-2 text-xs text-zinc-500 text-center">（不受解鎖影響，兩人都看得到）</div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-rose-200/60 bg-white/80 p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <h2 className="text-lg font-semibold">今日目標（快速加減 0.5h）</h2>
                  <button
                    className="text-sm rounded-2xl border border-rose-200 bg-white/80 px-4 py-3 font-medium hover:bg-white"
                    onClick={() => setDone(subjects.map(() => 0))}
                  >
                    全部歸零
                  </button>
                </div>

                <div className="space-y-4">
                  {subjects.map((s, i) => {
                    const d = done[i] || 0;
                    const ratio = d / s.target;

                    const myNote = myStudyNotes[i] ?? "";
                    const partnerNote = partnerStudyNotes[i] ?? "";

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

                        {/* ✅ 每科「今天讀什麼」（公開：兩人互看） */}
                        <div className="rounded-2xl border border-rose-200 bg-white/80 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-zinc-900">📚 今天讀什麼</div>
                            <div className="text-[11px] text-zinc-500">（兩個人都看得到）</div>
                          </div>

                          <textarea
                            className="w-full rounded-2xl border border-rose-200 bg-white/90 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
                            rows={2}
                            placeholder={`例如：${s.name} - 第X章 / 題目練習 / 筆記重點...`}
                            value={myNote}
                            onChange={(e) => {
                              const v = e.target.value;
                              setMyStudyNotes((prev) => prev.map((x, idx) => (idx === i ? v : x)));
                            }}
                            onBlur={async () => {
                              const next = myStudyNotes.map((x, idx) => (idx === i ? myNote : x));
                              await saveOpenNow(next, undefined);
                              setHistory((prev) => {
                                const nextH: HistoryStore = { ...prev };
                                const ex = nextH[dateKey] || { done: subjects.map(() => 0) };
                                nextH[dateKey] = { ...ex, myStudyNotes: next };
                                writeHistory(nextH);
                                return nextH;
                              });
                            }}
                          />

                          {partnerNote.trim() ? (
                            <div className="rounded-2xl border border-rose-200 bg-white/90 p-3 text-sm text-zinc-700">
                              <span className="font-medium text-rose-700">對方今天讀：</span> {partnerNote}
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-500">這科今天還沒寫內容～</div>
                          )}
                        </div>

                        <div className="text-xs text-zinc-500">
                          小提醒：每次變動會在 0.6 秒後自動同步 Supabase（時數）；文字內容在離開輸入框時同步。
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* Tab: 解鎖（今日一句話只放這裡） */}
          {tab === "unlock" && (
            <>
              {/* ✅ supporter 可編輯「我寫給對方的一句話」 */}
              {myRole === "supporter" && (
                <div className="rounded-3xl border border-rose-200 bg-white/80 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-zinc-900">✍️ 我寫給對方的今日一句話</div>
                    <div className="text-[11px] text-zinc-500">（對方解鎖後才看得到）</div>
                  </div>

                  <textarea
                    className="w-full rounded-2xl border border-rose-200 bg-white/90 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
                    rows={3}
                    placeholder="例如：今天你很棒，我看到你的努力了。慢慢來，我一直在 💛"
                    value={myMessageDraft}
                    onChange={(e) => setMyMessageDraft(e.target.value)}
                    onBlur={async () => {
                      if (!coupleId || !myRole) return;
                      await saveMyContent({
                        coupleId,
                        date: dateKey,
                        myRole,
                        partnerMessage: myMessageDraft || undefined,
                        couplePhotoPath: myCouplePhotoPath || undefined,
                        dailyPhotoPaths: myDailyPhotoPaths.length ? myDailyPhotoPaths : undefined,
                      });
                    }}
                  />
                </div>
              )}

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

                  {!effectiveUnlocked ? (
                    <div className="space-y-4">
                      <div className="text-sm text-zinc-700 leading-relaxed">
                        完成今日目標 <span className="text-rose-700 font-semibold">2/3</span> 才能看到「鼓勵訊息 / 今日照片」🌷
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
                        <div className="text-sm text-emerald-700 mb-2 font-medium">今日一句話（鼓勵訊息）</div>
                        <div className="text-base text-zinc-900 leading-relaxed">{unlockMessageText}</div>
                      </div>

                      <button
                        className="w-full rounded-2xl border border-emerald-200 bg-white/90 py-3 font-medium text-emerald-700 active:scale-[0.99]"
                        onClick={() => setTab("photos")}
                      >
                        去看今日照片 📷
                      </button>
                    </div>
                  )}

                  {/* ✅ 心得日記：永遠互看 */}
                  <div className="rounded-3xl border border-rose-200 bg-white/80 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-zinc-900">📝 今日心得日記（永遠可寫／永遠互看）</div>
                      <div className="text-[11px] text-zinc-500">（不受解鎖影響）</div>
                    </div>

                    <textarea
                      className="w-full rounded-2xl border border-rose-200 bg-white/90 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
                      rows={4}
                      placeholder="寫下今天的心得、卡住的點、明天要怎麼做、想對彼此說的話…"
                      value={myDiaryDraft}
                      onChange={(e) => setMyDiaryDraft(e.target.value)}
                      onBlur={async () => {
                        await saveOpenNow(undefined, myDiaryDraft);
                        setHistory((prev) => {
                          const nextH: HistoryStore = { ...prev };
                          const ex = nextH[dateKey] || { done: subjects.map(() => 0) };
                          nextH[dateKey] = { ...ex, myDiary: myDiaryDraft };
                          writeHistory(nextH);
                          return nextH;
                        });
                      }}
                    />

                    {partnerDiary.trim() ? (
                      <div className="rounded-2xl border border-rose-200 bg-white/90 p-3 text-sm text-zinc-700">
                        <div className="font-medium text-rose-700 mb-1">對方的心得：</div>
                        <div className="whitespace-pre-wrap leading-relaxed">{partnerDiary}</div>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500">對方今天還沒寫心得～</div>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}

          {/* Tab: 今日照片（只留分享） */}
          {tab === "photos" && (
            <div className="space-y-6">
              <section className="rounded-3xl border border-rose-200/60 bg-white/80 p-5 shadow-sm space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">今日照片分享（永久）</h2>
                    <p className="text-sm text-zinc-600">兩邊都能上傳；writer 未解鎖只會看到自己上傳的。</p>
                  </div>

                  <label
                    className={`inline-flex cursor-pointer items-center justify-center rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-sm active:scale-[0.99] ${
                      uploadingDaily ? "bg-zinc-400" : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                  >
                    {uploadingDaily ? "上傳中..." : "上傳今日照片"}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadDailyPhotos(e.target.files)} />
                  </label>
                </div>

                {displayDailyPhotos.length === 0 ? (
                  <div className="rounded-2xl border border-rose-200 bg-white/70 p-4 text-sm text-zinc-600">
                    還沒有照片～上傳 1～3 張，回顧時會很有成就感 ✨
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {displayDailyPhotos.map((path) => (
                      <div key={path} className="relative overflow-hidden rounded-2xl border border-rose-200 bg-white">
                        <div className="aspect-square">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={publicUrl(path)} alt={path} className="h-full w-full object-cover" />
                        </div>

                        {myDailyPhotoPaths.includes(path) ? (
                          <button
                            className="absolute right-2 top-2 rounded-full bg-white/90 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 active:scale-[0.99]"
                            onClick={() => deleteDailyPhoto(path)}
                          >
                            刪除
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-xs text-zinc-500">
                  規則備註：rueiyu（supporter）永遠看得到雙方內容；wilson（writer）未達 2/3 前只看得到自己上傳的內容，達標後才會看到 rueiyu 上傳的內容。
                </div>
              </section>
            </div>
          )}

          {/* Tab: 回顧牆 */}
          {tab === "history" && (
            <div className="space-y-6">
              <section className="rounded-3xl border border-rose-200/60 bg-white/80 p-5 shadow-sm space-y-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">🗓️ 回顧牆（跨裝置）</h2>
                      <p className="text-sm text-zinc-600">
                        ✅ 顯示你與對方的「用功時數」；照片/鼓勵訊息仍依解鎖規則遮蔽。<br />
                        ✅ 另外：各科「讀什麼」+「心得日記」屬於公開內容，兩人永遠互看。
                      </p>
                    </div>

                    <button
                      className="text-sm rounded-2xl border border-rose-200 bg-white/80 px-4 py-3 font-medium hover:bg-white active:scale-[0.99]"
                      onClick={() => {
                        if (!confirm("確定要清空本機回顧快取嗎？（不會刪 Supabase）")) return;
                        localStorage.removeItem("studybuddy_history_v1");
                        setHistory({});
                        setDone(subjects.map(() => 0));
                      }}
                    >
                      清空本機快取
                    </button>
                  </div>

                  {/* ✅ 近30天累計（你說「今天以來統計總時數」：這裡先做近30天版本） */}
                  <div className="rounded-2xl border border-rose-200 bg-white/70 p-4">
                    <div className="text-sm font-medium text-zinc-900">📈 累計總時數（近 30 天）</div>
                    <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                      <div className="rounded-2xl border border-rose-200 bg-white/80 p-3">
                        <div className="text-zinc-500 text-xs">我</div>
                        <div className="text-lg font-semibold text-zinc-900">{historyTotals.my.toFixed(1)}h</div>
                      </div>
                      <div className="rounded-2xl border border-rose-200 bg-white/80 p-3">
                        <div className="text-zinc-500 text-xs">對方</div>
                        <div className="text-lg font-semibold text-zinc-900">{historyTotals.pt.toFixed(1)}h</div>
                      </div>
                      <div className="rounded-2xl border border-rose-200 bg-white/80 p-3">
                        <div className="text-zinc-500 text-xs">合計</div>
                        <div className="text-lg font-semibold text-rose-700">{historyTotals.both.toFixed(1)}h</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">（目前是以回顧牆載入的近30天資料統計）</div>
                  </div>
                </div>

                {dates.length === 0 ? (
                  <div className="rounded-2xl border border-rose-200 bg-white/70 p-4 text-sm text-zinc-600">
                    還沒有紀錄～從今天開始累積，回顧牆會越來越可愛 ✨
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dates.map((d) => {
                      const r = history[d];

                      const dTotal =
                        typeof r?.totalDone === "number"
                          ? r.totalDone
                          : (r?.done || []).reduce((s, x) => s + (Number(x) || 0), 0);

                      const pTotal = typeof r?.partnerTotalDone === "number" ? r.partnerTotalDone : 0;

                      const isUnlock =
                        myRole === "supporter"
                          ? true
                          : typeof r?.unlocked === "boolean"
                          ? r.unlocked
                          : totalTarget === 0
                          ? false
                          : dTotal / totalTarget >= 2 / 3;

                      const ratioMine = totalTarget === 0 ? 0 : dTotal / totalTarget;
                      const ratioPartner = totalTarget === 0 ? 0 : pTotal / totalTarget;

                      const photos = (r?.dailyPhotoPaths || []) as string[];

                      const myNotes = normalizeStudyNotes(r?.myStudyNotes);
                      const ptNotes = normalizeStudyNotes(r?.partnerStudyNotes);

                      const myDiary = (r?.myDiary ?? "").trim();
                      const ptDiary = (r?.partnerDiary ?? "").trim();

                      const hasAnyNotes = myNotes.some((x) => x.trim()) || ptNotes.some((x) => x.trim());

                      return (
                        <div key={d} className="rounded-2xl border border-rose-200 bg-white/70 p-4 space-y-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="font-medium">
                              {d}{" "}
                              <span
                                className={`ml-2 text-xs px-2 py-1 rounded-full border ${
                                  isUnlock ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-white/80 text-rose-700"
                                }`}
                              >
                                {isUnlock ? "已解鎖" : "未解鎖"}
                              </span>
                            </div>

                            <div className="text-sm text-zinc-600">
                              我 {dTotal.toFixed(1)}h（{Math.round(ratioMine * 100)}%） / 對方 {pTotal.toFixed(1)}h（{Math.round(ratioPartner * 100)}%） / 目標{" "}
                              {totalTarget.toFixed(1)}h
                            </div>
                          </div>

                          {/* 照片（仍受解鎖影響） */}
                          {photos.length === 0 ? (
                            <div className="text-sm text-zinc-500">這天沒有照片或你尚未解鎖可見內容。</div>
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

                          {/* 一句話（仍受解鎖影響） */}
                          {r?.partnerMessage?.trim() ? (
                            <div className="rounded-2xl border border-rose-200 bg-white/90 p-3 text-sm text-zinc-700">
                              <span className="font-medium text-rose-700">一句話：</span>{" "}
                              {isUnlock ? r.partnerMessage : "（未解鎖：達到 2/3 後才會看到 rueiyu 上傳的內容 💛）"}
                            </div>
                          ) : null}

                          {/* ✅ 公開：各科今天讀什麼（兩人互看） */}
                          {hasAnyNotes ? (
                            <div className="rounded-2xl border border-rose-200 bg-white/90 p-3 space-y-2">
                              <div className="font-medium text-zinc-900">📚 各科今天讀什麼（兩人互看）</div>

                              <div className="space-y-2">
                                {subjects.map((s, idx) => {
                                  const a = (myNotes[idx] ?? "").trim();
                                  const b = (ptNotes[idx] ?? "").trim();
                                  if (!a && !b) return null;

                                  return (
                                    <div key={s.name} className="rounded-2xl border border-rose-200 bg-white/80 p-3 text-sm">
                                      <div className="font-medium text-rose-700 mb-1">{s.name}</div>
                                      {a ? (
                                        <div className="text-zinc-700">
                                          <span className="font-medium">我：</span> {a}
                                        </div>
                                      ) : null}
                                      {b ? (
                                        <div className="text-zinc-700 mt-1">
                                          <span className="font-medium">對方：</span> {b}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-500">這天沒有填「讀什麼」內容～</div>
                          )}

                          {/* ✅ 公開：心得日記（兩人互看） */}
                          {(myDiary || ptDiary) ? (
                            <div className="rounded-2xl border border-rose-200 bg-white/90 p-3 space-y-2">
                              <div className="font-medium text-zinc-900">📝 心得日記（兩人互看）</div>
                              {myDiary ? (
                                <div className="rounded-2xl border border-rose-200 bg-white/80 p-3 text-sm text-zinc-700 whitespace-pre-wrap">
                                  <span className="font-medium text-rose-700">我：</span> {myDiary}
                                </div>
                              ) : null}
                              {ptDiary ? (
                                <div className="rounded-2xl border border-rose-200 bg-white/80 p-3 text-sm text-zinc-700 whitespace-pre-wrap">
                                  <span className="font-medium text-rose-700">對方：</span> {ptDiary}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-500">這天沒有寫心得日記～</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>

      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowUnlockModal(false)} />
          <div className="relative w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-xl">
            <div className="text-center space-y-2">
              <div className="text-3xl">🎉</div>
              <h3 className="text-xl font-semibold text-zinc-900">解鎖成功！</h3>
              <p className="text-sm text-zinc-600">
                你已完成今日目標的 <span className="font-semibold text-rose-700">2/3</span>，現在可以解鎖「rueiyu 的鼓勵訊息 / 今日照片」✨
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

/** ✅ 工具：把 study_notes 正規化成固定長度 */
function normalizeStudyNotes(input: any): string[] {
  const base = subjects.map(() => "");
  if (!Array.isArray(input)) return base;
  return base.map((_, i) => (typeof input[i] === "string" ? input[i] : ""));
}

/** ✅ 存我的進度：study_progress */
async function saveMyProgress({
  coupleId,
  date,
  done,
  totalDone,
  unlocked,
}: {
  coupleId: string;
  date: string;
  done: number[];
  totalDone: number;
  unlocked: boolean;
}) {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return { error: userErr };
  if (!user) return { error: new Error("No user session (not logged in)") };

  const payload: any = {
    user_id: user.id,
    couple_id: coupleId,
    date,
    done,
    total_done: totalDone,
    unlocked,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("study_progress").upsert(payload, { onConflict: "user_id,date" });
  return { error };
}

/** ✅ 讀近 30 天「雙方進度」：study_progress */
async function fetchCoupleProgress(coupleId: string, fromDateISO: string) {
  const { data, error } = await supabase
    .from("study_progress")
    .select("user_id, couple_id, date, done, total_done, unlocked")
    .eq("couple_id", coupleId)
    .gte("date", fromDateISO)
    .order("date", { ascending: false });

  return { data: (data ?? []) as ProgressRow[], error };
}

/** ✅ 存我的內容：day_content（今日照片/一句話，受解鎖規則影響） */
async function saveMyContent({
  coupleId,
  date,
  myRole,
  partnerMessage,
  couplePhotoPath,
  dailyPhotoPaths,
}: {
  coupleId: string;
  date: string;
  myRole: Role;
  partnerMessage?: string;
  couplePhotoPath?: string;
  dailyPhotoPaths?: string[];
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
    author_id: user.id,
    author_role: myRole,
    partner_message: typeof partnerMessage === "string" ? partnerMessage : null,
    couple_photo_path: typeof couplePhotoPath === "string" ? couplePhotoPath : null,
    daily_photo_paths: Array.isArray(dailyPhotoPaths) ? dailyPhotoPaths : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("day_content").upsert(payload, { onConflict: "author_id,date" });
  return { error };
}

/** ✅ 讀今天內容：day_content（今日照片/一句話；RLS 會自動過濾對方內容） */
async function fetchDayContent(coupleId: string, date: string) {
  const { data, error } = await supabase
    .from("day_content")
    .select("couple_id, date, author_id, author_role, partner_message, couple_photo_path, daily_photo_paths")
    .eq("couple_id", coupleId)
    .eq("date", date);

  return { data: (data ?? []) as ContentRow[], error };
}

/** ✅ 存公開內容：day_open_content（讀什麼/心得；永遠互看） */
async function saveMyOpenContent({
  coupleId,
  date,
  myRole,
  studyNotes,
  unlockDiary,
}: {
  coupleId: string;
  date: string;
  myRole: Role;
  studyNotes: string[];
  unlockDiary: string;
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
    author_id: user.id,
    author_role: myRole,
    study_notes: Array.isArray(studyNotes) ? studyNotes : null,
    unlock_diary: typeof unlockDiary === "string" ? unlockDiary : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("day_open_content").upsert(payload, { onConflict: "author_id,date" });
  return { error };
}

/** ✅ 讀近 30 天公開內容：day_open_content（永遠互看） */
async function fetchOpenContentRange(coupleId: string, fromDateISO: string) {
  const { data, error } = await supabase
    .from("day_open_content")
    .select("couple_id, date, author_id, author_role, study_notes, unlock_diary")
    .eq("couple_id", coupleId)
    .gte("date", fromDateISO)
    .order("date", { ascending: false });

  return { data: (data ?? []) as OpenRow[], error };
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
    .maybeSingle();

  if (error) return { profile: null, error };
  if (!data) return { profile: null, error: new Error("Profile not found") };

  return { profile: data, error: null };
}
