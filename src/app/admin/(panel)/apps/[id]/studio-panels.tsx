"use client";

import { useEffect, useMemo, useState } from "react";
import { adminJson } from "@/lib/superadmin/browser";
import type { BusinessHourRow, BusinessUserRow } from "@/lib/superadmin/types";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

interface DayDraft {
  dayOfWeek: number;
  isActive: boolean;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
}

function clock(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 5);
}

function suggestedDay(day: number, active: boolean): DayDraft {
  const friday = day === 5;
  const saturday = day === 6;
  return {
    dayOfWeek: day,
    isActive: active && !saturday,
    startTime: "09:00",
    endTime: friday || saturday ? "14:00" : "18:00",
    breakStart: "",
    breakEnd: "",
  };
}

function daysFor(hours: BusinessHourRow[], userId: string): DayDraft[] {
  const mine = hours.filter((row) => row.user_id === userId);
  return DAY_NAMES.map((_, day) => {
    const row = mine.find((item) => item.day_of_week === day);
    if (!row) return suggestedDay(day, mine.length === 0);
    const breakRow = Array.isArray(row.breaks) ? row.breaks[0] : null;
    return {
      dayOfWeek: day,
      isActive: row.is_active === true,
      startTime: clock(row.start_time) || "09:00",
      endTime: clock(row.end_time) || "18:00",
      breakStart: clock(breakRow?.start_time || row.break_start_time),
      breakEnd: clock(breakRow?.end_time || row.break_end_time),
    };
  });
}

export function HoursPanel({
  businessId,
  admins,
  hours,
  onSaved,
}: {
  businessId: string;
  admins: BusinessUserRow[];
  hours: BusinessHourRow[];
  onSaved: (message: string, kind?: "success" | "error") => void;
}) {
  const [userId, setUserId] = useState(admins[0]?.id ?? "");
  const [days, setDays] = useState<DayDraft[]>(() => (userId ? daysFor(hours, userId) : []));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!admins.some((admin) => admin.id === userId)) {
      setUserId(admins[0]?.id ?? "");
    }
  }, [admins, userId]);

  useEffect(() => {
    if (!userId) return;
    setDays(daysFor(hours, userId));
  }, [hours, userId]);

  const manager = admins.find((admin) => admin.id === userId);

  function patchDay(dayOfWeek: number, patch: Partial<DayDraft>) {
    setDays((current) => current.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day)));
  }

  async function save() {
    if (!userId) return;
    setPending(true);
    setError("");
    try {
      await adminJson(`/api/admin/apps/${businessId}/hours`, {
        method: "PUT",
        body: JSON.stringify({ userId, days }),
      });
      onSaved(`שעות העבודה של ${manager?.name || "המנהלת"} נשמרו`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת השעות נכשלה");
    } finally {
      setPending(false);
    }
  }

  if (admins.length === 0) {
    return (
      <section className="admin-card">
        <div className="admin-card-head">
          <h2>שעות עבודה של המנהלת</h2>
        </div>
        <div className="admin-empty">אין מנהלת באפליקציה, אז אין למי לשמור שעות</div>
      </section>
    );
  }

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <h2>שעות עבודה של המנהלת</h2>
        <span className="admin-note">מופיעות ביומן של האפליקציה</span>
      </div>
      {admins.length > 1 ? (
        <label className="admin-field admin-hours-manager">
          מנהלת
          <select value={userId} onChange={(event) => setUserId(event.target.value)}>
            {admins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.name || admin.phone || "מנהלת"}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="admin-note">
          {manager?.name || "מנהלת"}
          {manager?.phone ? (
            <>
              {" "}
              · <span dir="ltr">{manager.phone}</span>
            </>
          ) : null}
        </p>
      )}
      <div className="admin-hours">
        <div className="admin-hour-row admin-hour-head" aria-hidden>
          <span>יום</span>
          <span>פתוח</span>
          <span>התחלה</span>
          <span>סיום</span>
          <span>הפסקה מ-</span>
          <span>הפסקה עד</span>
        </div>
        {days.map((day) => (
          <div className={`admin-hour-row ${day.isActive ? "" : "is-off"}`} key={day.dayOfWeek}>
            <strong>{DAY_NAMES[day.dayOfWeek]}</strong>
            <label className="admin-hour-open">
              <input
                type="checkbox"
                checked={day.isActive}
                onChange={(event) => patchDay(day.dayOfWeek, { isActive: event.target.checked })}
              />
              <span>{day.isActive ? "פתוח" : "סגור"}</span>
            </label>
            <label className="admin-field">
              <span className="admin-hour-label">התחלה</span>
              <input
                type="time"
                dir="ltr"
                value={day.startTime}
                onChange={(event) => patchDay(day.dayOfWeek, { startTime: event.target.value })}
              />
            </label>
            <label className="admin-field">
              <span className="admin-hour-label">סיום</span>
              <input
                type="time"
                dir="ltr"
                value={day.endTime}
                onChange={(event) => patchDay(day.dayOfWeek, { endTime: event.target.value })}
              />
            </label>
            <label className="admin-field">
              <span className="admin-hour-label">הפסקה מ-</span>
              <input
                type="time"
                dir="ltr"
                value={day.breakStart}
                onChange={(event) => patchDay(day.dayOfWeek, { breakStart: event.target.value })}
              />
            </label>
            <label className="admin-field">
              <span className="admin-hour-label">הפסקה עד</span>
              <input
                type="time"
                dir="ltr"
                value={day.breakEnd}
                onChange={(event) => patchDay(day.dayOfWeek, { breakEnd: event.target.value })}
              />
            </label>
          </div>
        ))}
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      <button className="admin-btn" type="button" disabled={pending} onClick={() => void save()}>
        {pending ? "שומר…" : "שמירת שעות"}
      </button>
    </section>
  );
}

type HeroMode = "marquee" | "single_fullbleed";

function heroState(profile: Record<string, unknown>) {
  const mode: HeroMode = profile.home_hero_mode === "single_fullbleed" ? "single_fullbleed" : "marquee";
  const images = Array.isArray(profile.home_hero_images)
    ? profile.home_hero_images.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  const singleUrl = typeof profile.home_hero_single_url === "string" ? profile.home_hero_single_url : "";
  const kind = profile.home_hero_single_kind === "video" ? "video" : "image";
  return { mode, images, singleUrl, kind };
}

function isVideo(url: string, kind?: string) {
  return kind === "video" || /\.(mp4|mov|webm)(\?|$)/i.test(url);
}

export function HomeHeroPanel({
  businessId,
  profile,
  onSaved,
}: {
  businessId: string;
  profile: Record<string, unknown>;
  onSaved: (message: string, kind?: "success" | "error") => void;
}) {
  const saved = useMemo(() => heroState(profile), [profile]);
  const [mode, setMode] = useState<HeroMode>(saved.mode);
  const [images, setImages] = useState(saved.images);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [pickerKey, setPickerKey] = useState(0);

  useEffect(() => {
    setMode(saved.mode);
    setImages(saved.images);
  }, [saved]);

  async function run(label: string, action: () => Promise<string>) {
    setPending(label);
    setError("");
    try {
      onSaved(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפעולה נכשלה");
    } finally {
      setPending("");
    }
  }

  function chooseMode(next: HeroMode) {
    if (next === mode || pending) return;
    const previous = mode;
    setMode(next);
    void run("mode", async () => {
      try {
        await adminJson(`/api/admin/apps/${businessId}/home`, {
          method: "PATCH",
          body: JSON.stringify({ mode: next }),
        });
      } catch (error) {
        setMode(previous);
        throw error;
      }
      return next === "marquee" ? "דף הבית מציג רצף תמונות" : "דף הבית מציג תמונה או סרטון אחד";
    });
  }

  async function upload(target: "marquee" | "single", list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    await run(target, async () => {
      const body = new FormData();
      body.set("target", target);
      for (const file of files) body.append("files", file);
      await adminJson(`/api/admin/apps/${businessId}/home`, { method: "POST", body });
      setPickerKey((value) => value + 1);
      return target === "marquee" ? `הועלו ${files.length} תמונות לדף הבית` : "הקובץ של דף הבית הוחלף";
    });
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= images.length) return;
    const copy = images.slice();
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    setImages(copy);
    void run("order", async () => {
      try {
        await adminJson(`/api/admin/apps/${businessId}/home`, {
          method: "PATCH",
          body: JSON.stringify({ images: copy }),
        });
      } catch (error) {
        setImages(images);
        throw error;
      }
      return "סדר התמונות נשמר";
    });
  }

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <h2>תמונות עיצוב בדף הבית</h2>
        <span className="admin-note">מה שהלקוחות רואות בפתיחת האפליקציה</span>
      </div>
      <div className="admin-hero-modes" role="radiogroup" aria-label="סוג תצוגה בדף הבית">
        <button type="button" className="admin-chip" aria-pressed={mode === "marquee"} onClick={() => chooseMode("marquee")}>
          רצף תמונות
        </button>
        <button
          type="button"
          className="admin-chip"
          aria-pressed={mode === "single_fullbleed"}
          onClick={() => chooseMode("single_fullbleed")}
        >
          תמונה או סרטון אחד
        </button>
      </div>

      {mode === "marquee" ? (
        <>
          {images.length === 0 ? (
            <div className="admin-empty">עדיין אין תמונות בדף הבית. כאן מעלים אותן כשמקימים את האפליקציה.</div>
          ) : (
            <div className="admin-hero-grid">
              {images.map((url, index) => (
                <figure className="admin-hero-tile" key={`${url}-${index}`}>
                  <img src={url} alt="" />
                  <figcaption>
                    <span>{index + 1}</span>
                    <span className="admin-hero-actions">
                      <button type="button" disabled={pending !== "" || index === 0} onClick={() => move(index, -1)}>
                        למעלה
                      </button>
                      <button
                        type="button"
                        disabled={pending !== "" || index === images.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        למטה
                      </button>
                      <button
                        type="button"
                        disabled={pending !== ""}
                        onClick={() =>
                          void run("delete", async () => {
                            await adminJson(`/api/admin/apps/${businessId}/home`, {
                              method: "DELETE",
                              body: JSON.stringify({ url }),
                            });
                            return "התמונה הוסרה מדף הבית";
                          })
                        }
                      >
                        מחיקה
                      </button>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          <label className="admin-field">
            הוספת תמונות
            <input
              key={pickerKey}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              disabled={pending !== ""}
              onChange={(event) => void upload("marquee", event.target.files)}
            />
          </label>
        </>
      ) : (
        <>
          {saved.singleUrl ? (
            <div className="admin-hero-single">
              {isVideo(saved.singleUrl, saved.kind) ? (
                <video src={saved.singleUrl} controls muted playsInline />
              ) : (
                <img src={saved.singleUrl} alt="" />
              )}
              <button
                className="admin-btn-ghost"
                type="button"
                disabled={pending !== ""}
                onClick={() =>
                  void run("delete", async () => {
                    await adminJson(`/api/admin/apps/${businessId}/home`, {
                      method: "DELETE",
                      body: JSON.stringify({ clearSingle: true }),
                    });
                    return "הקובץ הוסר מדף הבית";
                  })
                }
              >
                מחיקת הקובץ
              </button>
            </div>
          ) : (
            <div className="admin-empty">אין תמונה או סרטון מלא לדף הבית</div>
          )}
          <label className="admin-field">
            החלפת תמונה או סרטון
            <input
              key={pickerKey}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
              disabled={pending !== ""}
              onChange={(event) => void upload("single", event.target.files)}
            />
          </label>
        </>
      )}

      {error ? <p className="admin-error">{error}</p> : null}
      {pending === "marquee" || pending === "single" ? <p className="admin-note">מעלה…</p> : null}
    </section>
  );
}
