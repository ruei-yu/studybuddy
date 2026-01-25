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

type DayRecord = {
  date: string;

  // progress
  myDone: number[];
  myTotalDone: number;
  myUnlocked: boolean;
  partnerDone: number[];
  partnerTotalDone: number;

  // content (locked content: message/photos)
  partnerMessage?: string;
  dailyPhotoPaths?: string[]; // 可見的那一側（依 RLS/解鎖）
  // open content (always visible)
  myStudyNotes: string[];
  partnerStudyNotes: string[];
  myDiary: string;
  partnerDiary: string;
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

function normalizeStudyNotes(input: any): string[] {
  const base = subjects.map(() => "");
  if (!Array.isArray(input)) return base;
  return base.map((_, i) => (typeof input[i] === "string" ? input[i] : ""));
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
  const router = useRouter();
  const dateKey = useMemo(() => todayISO(), []);
  const unlockSectionRef = useRef<HTMLElement | null>(null);

  const [tab, setTab] = useState<TabKey>("checkin");

  // auth/profile
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  // progress (my side editable)
  const [done, setDone] = useState<number[]>(subjects.map(() => 0));
  const totalTarget = useMemo(() => subjects.reduce((s, x) => s + x.target, 0), []);
  const localTotalDone = useMemo(() => done.reduce((sum, h) => sum + (Number(h) || 0), 0), [done]);

  // locked content
  const [myMessageDraft, setMyMessageDraft] = useState<string>("");
  const [myCouplePhotoPath, setMyCouplePhotoPath] = useState<string | null>(null);
  const [myDailyPhotoPaths, setMyDailyPhotoPaths] = useState<string[]>([]);

  const [partnerMessage, setPartnerMessage] = useState<string>("");
  const [partnerDailyPhotoPaths, setPartnerDailyPhotoPaths] = useState<string[]>([]);

  // open content (always visible)
  const [myStudyNotes, setMyStudyNotes] = useState<string[]>(subjects.map(() => ""));
  const [partnerStudyNotes, setPartnerStudyNotes] = useState<string[]>(subjects.map(() => ""));
  const [myDiaryDraft, setMyDiaryDraft] = useState<string>("");
  const [partnerDiary, setPartnerDiary] = useState<string>("");

  // history from DB (30 days)
  const [history, setHistory] = useState<Record<string, DayRecord>>({});

  // UI bits
  const [uploadingCouple, setUploadingCouple] = useState(false);
  const [uploadingDaily, setUploadingDaily] = useState(false);

  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [confettiOn, setConfettiOn] = useState(false);

  const [couplePhotoVersion, setCouplePhotoVersion] = useState<number>(0);
  const [coupleImgFailed, setCoupleImgFailed] = useState(false);

  // hydration guards (避免 refetch 時把你正在打的文字「跳掉」)
  const hydratedTodayRef = useRef(false);
  const progressSaveTimerRef = useRef<number | null>(null);

  const dirtyRef = useRef({
    message: false,
    diary: false,
    studyNotes: false,
  });

  // login check
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.replace("/login");
    })();
  }, [router]);

  // load my uid + profile
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

  // effective unlock
  const effectiveUnlocked =
    myRole === "supporter"
      ? true
      : totalTarget === 0
      ? false
      : localTotalDone / totalTarget >= 2 / 3;

  const needHoursToUnlock = Math.max(0, (2 / 3) * totalTarget - localTotalDone);
  const unlockBadge = effectiveUnlocked ? "已解鎖" : `差 ${needHoursToUnlock.toFixed(1)}h`;
  const canSeePartner = myRole === "supporter" || effectiveUnlocked;

  // couple photo always visible (shared fixed path)
  const sharedCouplePath = coupleId ? `${coupleId}/couple_shared.jpg` : null;
  const coupleImgSrc =
    sharedCouplePath && !coupleImgFailed ? `${publicUrl(sharedCouplePath)}?t=${couplePhotoVersion || 0}` : null;

  // photos badge: my uploaded count
  const photosBadge = myDailyPhotoPaths.length ? `${myDailyPhotoPaths.length}張` : undefined;

  // display photos (no more “互相覆蓋”)
  const displayDailyPhotos = useMemo(() => {
    if (!canSeePartner) return myDailyPhotoPaths;
    const merged = [...partnerDailyPhotoPaths, ...myDailyPhotoPaths];
    return Array.from(new Set(merged));
  }, [canSeePartner, partnerDailyPhotoPaths, myDailyPhotoPaths]);

  // unlock message text
  const unlockMessageText =
    canSeePartner && partnerMessage.trim()
      ? partnerMessage.trim()
      : canSeePartner
      ? "我看到你今天的努力了，真的很為你驕傲。累了就休息一下，但別忘了你一直都在變強，我會一直陪你 💛"
      : "（未解鎖：達到 2/3 後就能看到對方給你的內容 💛）";

  // fetch + build 30 days history + hydrate today from DB
  const reloadAll = async () => {
    if (!coupleId || !myUserId || !myRole) return;

    const fromDate = isoDaysAgo(29);

    const [progRes, openRes, dayTodayRes, dayRangeRes] = await Promise.all([
      fetchCoupleProgress(coupleId, fromDate),
      fetchOpenContentRange(coupleId, fromDate),
      fetchDayContent(coupleId, dateKey), // today locked content
      fetchDayContentRange(coupleId, fromDate), // history locked content (RLS may hide some)
    ]);

    if (progRes.error) console.error("[fetchCoupleProgress] error:", progRes.error);
    if (openRes.error) console.error("[fetchOpenContentRange] error:", openRes.error);
    if (dayTodayRes.error) console.error("[fetchDayContent(today)] error:", dayTodayRes.error);
    if (dayRangeRes.error) console.error("[fetchDayContentRange] error:", dayRangeRes.error);

    const prog = progRes.data ?? [];
    const openRows = openRes.data ?? [];
    const todayContentRows = dayTodayRes.data ?? [];
    const contentRangeRows = dayRangeRes.data ?? [];

    // build map: progress by date -> mine/other
    const byDateProg: Record<string, { mine?: ProgressRow; other?: ProgressRow }> = {};
    for (const row of prog) {
      const d = row.date;
      if (!byDateProg[d]) byDateProg[d] = {};
      if (row.user_id === myUserId) byDateProg[d].mine = row;
      else byDateProg[d].other = row;
    }

    // build map: open content by date -> mine/other
    const byDateOpen: Record<string, { mine?: OpenRow; other?: OpenRow }> = {};
    for (const r of openRows) {
      const d = r.date;
      if (!byDateOpen[d]) byDateOpen[d] = {};
      if (r.author_id === myUserId) byDateOpen[d].mine = r;
      else byDateOpen[d].other = r;
    }

    // build map: day_content (locked) by date -> other content we can see (RLS already filtered)
    const byDateContentOther: Record<string, ContentRow | null> = {};
    for (const r of contentRangeRows) {
      // 我們只放 “對方那筆”（或當前 select 能看到的非自己筆）
      if (r.author_id !== myUserId) byDateContentOther[r.date] = r;
    }

    // build history 30 days
    const dates: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = isoDaysAgo(i);
      dates.push(d);
    }

    const nextHistory: Record<string, DayRecord> = {};
    for (const d of dates) {
      const mine = byDateProg[d]?.mine;
      const other = byDateProg[d]?.other;

      const myDone = Array.isArray(mine?.done) ? (mine!.done as number[]) : subjects.map(() => 0);
      const partnerDone = Array.isArray(other?.done) ? (other!.done as number[]) : subjects.map(() => 0);

      const myTotal =
        typeof mine?.total_done === "number" ? mine.total_done : myDone.reduce((s, x) => s + (Number(x) || 0), 0);
      const partnerTotal =
        typeof other?.total_done === "number" ? other.total_done : partnerDone.reduce((s, x) => s + (Number(x) || 0), 0);

      const myUnlocked =
        typeof mine?.unlocked === "boolean"
          ? mine.unlocked
          : totalTarget === 0
          ? false
          : myTotal / totalTarget >= 2 / 3;

      const openMine = byDateOpen[d]?.mine ?? null;
      const openOther = byDateOpen[d]?.other ?? null;

      const otherContent = byDateContentOther[d] ?? null;

      nextHistory[d] = {
        date: d,
        myDone,
        myTotalDone: myTotal,
        myUnlocked,
        partnerDone,
        partnerTotalDone: partnerTotal,
        partnerMessage: otherContent?.partner_message ?? "",
        dailyPhotoPaths: Array.isArray(otherContent?.daily_photo_paths) ? otherContent!.daily_photo_paths! : [],
        myStudyNotes: normalizeStudyNotes(openMine?.study_notes),
        partnerStudyNotes: normalizeStudyNotes(openOther?.study_notes),
        myDiary: (openMine?.unlock_diary ?? "") || "",
        partnerDiary: (openOther?.unlock_diary ?? "") || "",
      };
    }

    setHistory(nextHistory);

    // hydrate TODAY inputs (只在第一次、或你沒有 dirty 的情況下更新，避免「跳掉」)
    const todayMine = byDateProg[dateKey]?.mine;
    if (!hydratedTodayRef.current) {
      hydratedTodayRef.current = true;

      if (todayMine?.done && Array.isArray(todayMine.done)) setDone(todayMine.done as number[]);
    } else {
      // 之後進來不要強行覆蓋 done（你可能正在點 +0.5）
      // 但如果你想要「跨裝置同步我自己」也能立即反映，可以打開下面這行：
      // if (todayMine?.done && Array.isArray(todayMine.done)) setDone(todayMine.done as number[]);
    }

    // today locked content
    const mineContent = todayContentRows.find((r) => r.author_id === myUserId) ?? null;
    const otherContent = todayContentRows.find((r) => r.author_id !== myUserId) ?? null;

    // 我的 locked content：可編輯，但不要覆蓋你正在打的字
    if (!dirtyRef.current.message) setMyMessageDraft(mineContent?.partner_message ?? "");
    setMyCouplePhotoPath(mineContent?.couple_photo_path ?? null);
    setMyDailyPhotoPaths(Array.isArray(mineContent?.daily_photo_paths) ? mineContent!.daily_photo_paths! : []);

    // 對方 locked content：永遠以 DB 為準
    setPartnerMessage(otherContent?.partner_message ?? "");
    setPartnerDailyPhotoPaths(Array.isArray(otherContent?.daily_photo_paths) ? otherContent!.daily_photo_paths! : []);

    // today open content
    const todayOpenMine = byDateOpen[dateKey]?.mine ?? null;
    const todayOpenOther = byDateOpen[dateKey]?.other ?? null;

    if (!dirtyRef.current.studyNotes) setMyStudyNotes(normalizeStudyNotes(todayOpenMine?.study_notes));
    setPartnerStudyNotes(normalizeStudyNotes(todayOpenOther?.study_notes));

    if (!dirtyRef.current.diary) setMyDiaryDraft(todayOpenMine?.unlock_diary ?? "");
    setPartnerDiary(todayOpenOther?.unlock_diary ?? "");

    // refresh couple photo cache bust
    setCouplePhotoVersion(Date.now());
    setCoupleImgFailed(false);
  };

  // first load + reload when coupleId ready
  useEffect(() => {
    if (!coupleId || !myUserId || !myRole) return;
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupleId, myUserId, myRole, dateKey]);

  // Realtime subscriptions (cross devices instant sync)
  useEffect(() => {
    if (!coupleId || !myUserId) return;

    const channel = supabase
      .channel(`sb_${coupleId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "study_progress", filter: `couple_id=eq.${coupleId}` },
        () => reloadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "day_open_content", filter: `couple_id=eq.${coupleId}` },
        () => reloadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "day_content", filter: `couple_id=eq.${coupleId}` },
        () => reloadAll()
      )
      .subscribe((status) => {
        // console.log("[realtime]", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupleId, myUserId]);

  // autosave progress (debounced)
  useEffect(() => {
    if (!coupleId || !myUserId) return;

    if (progressSaveTimerRef.current) window.clearTimeout(progressSaveTimerRef.current);

    progressSaveTimerRef.current = window.setTimeout(() => {
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

    return () => {
      if (progressSaveTimerRef.current) window.clearTimeout(progressSaveTimerRef.current);
    };
  }, [coupleId, myUserId, dateKey, done, localTotalDone, effectiveUnlocked]);

  // unlock modal (only local UI; data is DB so won't "jump")
  useEffect(() => {
    if (effectiveUnlocked) {
      // 只要達標就可以彈（如果你不想跨裝置一直彈，我可以再幫你把「已彈過」存到 DB）
      setShowUnlockModal(true);
      setConfettiOn(true);
      window.setTimeout(() => setConfettiOn(false), 1200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUnlocked]);

  function scrollToUnlock() {
    const el = document.getElementById("unlock-section");
    el?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    location.href = "/login";
  }

  // =========================
  // Upload / Delete (locked content)
  // =========================
  async function uploadCouplePhoto(file: File | null) {
    if (!file) return;
    if (!coupleId || !myRole) return alert("尚未取得 coupleId/role，請重新整理頁面。");

    setUploadingCouple(true);
    try {
      const path = `${coupleId}/couple_shared.jpg`;

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type || "image/*",
      });
      if (upErr) throw upErr;

      setMyCouplePhotoPath(path);
      setCouplePhotoVersion(Date.now());
      setCoupleImgFailed(false);

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

  // save open content helper
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

  const dates = useMemo(() => sortDatesDesc(Object.keys(history)), [history]);

  const historyTotals = useMemo(() => {
    let my = 0;
    let pt = 0;
    for (const d of Object.keys(history)) {
      my += Number(history[d]?.myTotalDone || 0);
      pt += Number(history[d]?.partnerTotalDone || 0);
    }
    return { my, pt, both: my + pt };
  }, [history]);

  // =========================
  // UI
  // =========================
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
              <TabButton active={tab === "photos"} onClick={() => setTab("photos")} icon="📷" label="今日照片" badge={photosBadge} />
              <TabButton active={tab === "history"} onClick={() => setTab("history")} icon="🗓️" label="回顧牆" />
            </div>
          </nav>

          {/* Tab: 打卡 */}
          {tab === "checkin" && (
            <div className="space-y-6">
              <section className="rounded-3xl border border-amber-200/60 bg-white/80 p-5 shadow-sm">
                <div className="grid gap-5 sm:grid-cols-[1fr_280px] items-stretch">
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

                    <div className="mt-4 max-w-[520px]">
                      <div className="h-3 w-full rounded-full bg-rose-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all"
                          style={{ width: `${clamp(totalTarget === 0 ? 0 : (localTotalDone / totalTarget) * 100, 0, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 text-sm">
                      {effectiveUnlocked ? (
                        <span className="text-emerald-700 font-medium">✅ 已達成 2/3，解鎖成功！</span>
                      ) : (
                        <span className="text-amber-700">
                          還差 <span className="font-semibold">{needHoursToUnlock.toFixed(1)}</span> 小時就能解鎖
                        </span>
                      )}
                    </div>

                    {!effectiveUnlocked && (
                      <button
                        className="mt-4 w-full max-w-[520px] rounded-2xl bg-rose-600 text-white py-3 font-medium shadow-sm active:scale-[0.99]"
                        onClick={() => setTab("unlock")}
                      >
                        去解鎖頁看看 🎁
                      </button>
                    )}
                  </div>

                  {/* 合照（永遠可看） */}
                  <div className="rounded-3xl border border-rose-200 bg-white/80 p-4 shadow-sm flex flex-col">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="font-semibold text-zinc-900 flex items-center gap-2">
                        <span>👩‍❤️‍👨</span>
                        <span>合照</span>
                      </div>

                      <label
                        className={`inline-flex cursor-pointer items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-white shadow-sm active:scale-[0.99] ${
                          uploadingCouple ? "bg-zinc-400" : "bg-rose-600 hover:bg-rose-700"
                        }`}
                      >
                        {uploadingCouple ? "上傳中..." : "上傳"}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadCouplePhoto(e.target.files?.[0] ?? null)} />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-rose-200 bg-white/90 p-3 flex-1">
                      {coupleImgSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={coupleImgSrc}
                          alt="couple"
                          className="w-full h-auto rounded-xl"
                          onError={() => setCoupleImgFailed(true)}
                        />
                      ) : (
                        <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-rose-700/70">
                          <div className="text-3xl">📷</div>
                          <div className="text-sm">在這裡放你們的合照</div>
                          <div className="text-xs text-zinc-500">（我們都是彼此前進的動力）</div>
                        </div>
                      )}
                    </div>

                    <div className="mt-2 text-xs text-zinc-500 text-center">（今天也一起加油吧💖）</div>
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
                            onClick={() => setDone((prev) => prev.map((x, idx) => (idx === i ? clamp((x || 0) - 0.5, 0, 99) : x)))}
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
                            onClick={() => setDone((prev) => prev.map((x, idx) => (idx === i ? clamp((x || 0) + 0.5, 0, 99) : x)))}
                          >
                            +0.5
                          </button>
                        </div>

                        {/* 公開：今天讀什麼（兩人互看） */}
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
                              dirtyRef.current.studyNotes = true;
                              const v = e.target.value;
                              setMyStudyNotes((prev) => prev.map((x, idx) => (idx === i ? v : x)));
                            }}
                            onBlur={async () => {
                              const next = myStudyNotes.map((x, idx) => (idx === i ? myNote : x));
                              await saveOpenNow(next, undefined);
                              dirtyRef.current.studyNotes = false;
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

                        <div className="text-xs text-zinc-500">小提醒：時數 0.6 秒後自動同步；文字在離開輸入框時同步。</div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* Tab: 解鎖 */}
          {tab === "unlock" && (
            <>
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
                    onChange={(e) => {
                      dirtyRef.current.message = true;
                      setMyMessageDraft(e.target.value);
                    }}
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
                      dirtyRef.current.message = false;
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

                      <button className="w-full rounded-2xl bg-rose-600 text-white py-3 font-medium shadow-sm active:scale-[0.99]" onClick={() => setTab("checkin")}>
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

                  {/* 公開：心得日記（永遠互看） */}
                  <div className="rounded-3xl border border-rose-200 bg-white/80 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-zinc-900">📝 今日心得日記。想訴苦的話隨時都可以喔！</div>
                      <div className="text-[11px] text-zinc-500">（不受解鎖影響）</div>
                    </div>

                    <textarea
                      className="w-full rounded-2xl border border-rose-200 bg-white/90 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
                      rows={4}
                      placeholder="寫下今天的心得、卡住的點、明天要怎麼做、想對彼此說的話…"
                      value={myDiaryDraft}
                      onChange={(e) => {
                        dirtyRef.current.diary = true;
                        setMyDiaryDraft(e.target.value);
                      }}
                      onBlur={async () => {
                        await saveOpenNow(undefined, myDiaryDraft);
                        dirtyRef.current.diary = false;
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

          {/* Tab: 今日照片 */}
          {tab === "photos" && (
            <div className="space-y-6">
              <section className="rounded-3xl border border-rose-200/60 bg-white/80 p-5 shadow-sm space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">今日照片分享</h2>
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
                        ) : (
                          <div className="absolute left-2 top-2 rounded-full bg-white/90 border border-rose-200 px-3 py-1 text-[10px] font-medium text-rose-700">
                            對方
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-xs text-zinc-500">
                  規則：supporter 永遠看得到雙方內容；writer 未達 2/3 前只看得到自己上傳，達標後才會看到對方上傳。
                </div>
              </section>
            </div>
          )}

          {/* Tab: 回顧 */}
          {tab === "history" && (
            <div className="space-y-6">
              <section className="rounded-3xl border border-rose-200/60 bg-white/80 p-5 shadow-sm space-y-4">
                <div className="flex flex-col gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">🗓️ 回顧牆</h2>
                    <p className="text-sm text-zinc-600">
                      ✅ 這裡所有資料都來自 Supabase（所以跨手機不會跳）。<br />
                      ✅ 「讀什麼」+「心得」永遠互看；照片/鼓勵訊息依解鎖規則顯示。<br />
                      ✅ 若你開了 Realtime，兩邊會自動更新。
                    </p>
                  </div>

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
                  </div>
                </div>

                {dates.length === 0 ? (
                  <div className="rounded-2xl border border-rose-200 bg-white/70 p-4 text-sm text-zinc-600">還沒有紀錄～</div>
                ) : (
                  <div className="space-y-4">
                    {dates.map((d) => {
                      const r = history[d];
                      const isUnlock = myRole === "supporter" ? true : r?.myUnlocked;

                      const ratioMine = totalTarget === 0 ? 0 : r.myTotalDone / totalTarget;
                      const ratioPartner = totalTarget === 0 ? 0 : r.partnerTotalDone / totalTarget;

                      const photos = (r.dailyPhotoPaths || []) as string[];
                      const hasAnyNotes =
                        r.myStudyNotes.some((x) => x.trim()) || r.partnerStudyNotes.some((x) => x.trim());

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
                              我 {r.myTotalDone.toFixed(1)}h（{Math.round(ratioMine * 100)}%） / 對方 {r.partnerTotalDone.toFixed(1)}h（
                              {Math.round(ratioPartner * 100)}%） / 目標 {totalTarget.toFixed(1)}h
                            </div>
                          </div>

                          {/* 照片（依 RLS/解鎖可見） */}
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

                          {/* 一句話（依解鎖顯示） */}
                          {r.partnerMessage?.trim() ? (
                            <div className="rounded-2xl border border-rose-200 bg-white/90 p-3 text-sm text-zinc-700">
                              <span className="font-medium text-rose-700">一句話：</span>{" "}
                              {isUnlock ? r.partnerMessage : "（未解鎖：達到 2/3 後才會看到對方內容 💛）"}
                            </div>
                          ) : null}

                          {/* 公開：各科今天讀什麼 */}
                          {hasAnyNotes ? (
                            <div className="rounded-2xl border border-rose-200 bg-white/90 p-3 space-y-2">
                              <div className="font-medium text-zinc-900">📚 各科今天讀什麼</div>
                              <div className="space-y-2">
                                {subjects.map((s, idx) => {
                                  const a = (r.myStudyNotes[idx] ?? "").trim();
                                  const b = (r.partnerStudyNotes[idx] ?? "").trim();
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

                          {/* 公開：心得日記 */}
                          {(r.myDiary.trim() || r.partnerDiary.trim()) ? (
                            <div className="rounded-2xl border border-rose-200 bg-white/90 p-3 space-y-2">
                              <div className="font-medium text-zinc-900">📝 心得日記（兩人互看）</div>
                              {r.myDiary.trim() ? (
                                <div className="rounded-2xl border border-rose-200 bg-white/80 p-3 text-sm text-zinc-700 whitespace-pre-wrap">
                                  <span className="font-medium text-rose-700">我：</span> {r.myDiary}
                                </div>
                              ) : null}
                              {r.partnerDiary.trim() ? (
                                <div className="rounded-2xl border border-rose-200 bg-white/80 p-3 text-sm text-zinc-700 whitespace-pre-wrap">
                                  <span className="font-medium text-rose-700">對方：</span> {r.partnerDiary}
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
                你已完成今日目標的 <span className="font-semibold text-rose-700">2/3</span>，現在可以解鎖「對方的鼓勵訊息 / 今日照片」✨
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

              <button className="rounded-2xl border border-rose-200 bg-white py-3 font-medium hover:bg-rose-50 active:scale-[0.99]" onClick={() => setShowUnlockModal(false)}>
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

/** =========================
 * DB functions
 * ========================= */

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

async function fetchCoupleProgress(coupleId: string, fromDateISO: string) {
  const { data, error } = await supabase
    .from("study_progress")
    .select("user_id, couple_id, date, done, total_done, unlocked")
    .eq("couple_id", coupleId)
    .gte("date", fromDateISO)
    .order("date", { ascending: false });

  return { data: (data ?? []) as ProgressRow[], error };
}

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

async function fetchDayContent(coupleId: string, date: string) {
  const { data, error } = await supabase
    .from("day_content")
    .select("couple_id, date, author_id, author_role, partner_message, couple_photo_path, daily_photo_paths")
    .eq("couple_id", coupleId)
    .eq("date", date);

  return { data: (data ?? []) as ContentRow[], error };
}

async function fetchDayContentRange(coupleId: string, fromDateISO: string) {
  const { data, error } = await supabase
    .from("day_content")
    .select("couple_id, date, author_id, author_role, partner_message, couple_photo_path, daily_photo_paths")
    .eq("couple_id", coupleId)
    .gte("date", fromDateISO)
    .order("date", { ascending: false });

  return { data: (data ?? []) as ContentRow[], error };
}

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

async function fetchOpenContentRange(coupleId: string, fromDateISO: string) {
  const { data, error } = await supabase
    .from("day_open_content")
    .select("couple_id, date, author_id, author_role, study_notes, unlock_diary")
    .eq("couple_id", coupleId)
    .gte("date", fromDateISO)
    .order("date", { ascending: false });

  return { data: (data ?? []) as OpenRow[], error };
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
