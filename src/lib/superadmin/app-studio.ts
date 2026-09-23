import { randomBytes } from "node:crypto";
import { getServiceSupabase } from "@/lib/sms/supabase-admin";

const BUCKET = "app_design";
const PUBLIC_MARKER = "/storage/v1/object/public/app_design/";
const HERO_PREFIX = "business-images/home-hero";
const MAX_BYTES = 40 * 1024 * 1024;
const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export class StudioError extends Error {}

export interface ManagerDayInput {
  dayOfWeek: number;
  isActive: boolean;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
}

function minutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function dbTime(value: string) {
  return `${value}:00`;
}

function assertWeek(days: ManagerDayInput[]) {
  if (days.length !== 7) throw new StudioError("יש לשלוח שעות לכל שבעת הימים");
  const seen = new Set<number>();
  for (const day of days) {
    if (!Number.isInteger(day.dayOfWeek) || day.dayOfWeek < 0 || day.dayOfWeek > 6) {
      throw new StudioError("יום לא תקין");
    }
    if (seen.has(day.dayOfWeek)) throw new StudioError("יום כפול בשעות");
    seen.add(day.dayOfWeek);
    const label = DAY_NAMES[day.dayOfWeek];
    if (!TIME_RE.test(day.startTime) || !TIME_RE.test(day.endTime)) {
      throw new StudioError(`שעת התחלה וסיום ביום ${label} לא תקינות`);
    }
    if (minutes(day.startTime) >= minutes(day.endTime)) {
      throw new StudioError(`ביום ${label} שעת הסיום צריכה להיות אחרי ההתחלה`);
    }
    const hasBreak = Boolean(day.breakStart || day.breakEnd);
    if (hasBreak && (!TIME_RE.test(day.breakStart) || !TIME_RE.test(day.breakEnd))) {
      throw new StudioError(`ההפסקה ביום ${label} צריכה שעת התחלה וסיום`);
    }
    if (hasBreak) {
      const start = minutes(day.breakStart);
      const end = minutes(day.breakEnd);
      if (start >= end || start < minutes(day.startTime) || end > minutes(day.endTime)) {
        throw new StudioError(`ההפסקה ביום ${label} צריכה להיות בתוך שעות העבודה`);
      }
    }
  }
}

export async function saveManagerHours(businessId: string, userId: string, days: ManagerDayInput[]) {
  assertWeek(days);
  const db = getServiceSupabase();

  const { data: admin, error: adminError } = await db
    .from("users")
    .select("id, user_type")
    .eq("id", userId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (adminError) throw new StudioError("טעינת המנהלת נכשלה");
  if (!admin || admin.user_type !== "admin") throw new StudioError("השעות נשמרות רק למנהלת של האפליקציה");

  const { data: existing, error: existingError } = await db
    .from("business_hours")
    .select("id, day_of_week, slot_duration_minutes")
    .eq("business_id", businessId)
    .eq("user_id", userId);
  if (existingError) throw new StudioError("טעינת השעות נכשלה");

  const byDay = new Map<number, { id: string; slot_duration_minutes: number | null }[]>();
  for (const row of existing ?? []) {
    const day = Number(row.day_of_week);
    const list = byDay.get(day) ?? [];
    list.push({ id: String(row.id), slot_duration_minutes: row.slot_duration_minutes });
    byDay.set(day, list);
  }

  for (const day of days) {
    const breaks =
      day.breakStart && day.breakEnd ? [{ start_time: day.breakStart, end_time: day.breakEnd }] : [];
    const patch = {
      start_time: dbTime(day.startTime),
      end_time: dbTime(day.endTime),
      is_active: day.isActive,
      breaks,
      break_start_time: breaks.length ? dbTime(day.breakStart) : null,
      break_end_time: breaks.length ? dbTime(day.breakEnd) : null,
    };
    const rows = byDay.get(day.dayOfWeek) ?? [];
    if (rows.length === 0) {
      const { error } = await db.from("business_hours").insert({
        business_id: businessId,
        user_id: userId,
        day_of_week: day.dayOfWeek,
        slot_duration_minutes: 60,
        ...patch,
      });
      if (error) {
        console.error("[studio] insert hours:", error.message);
        throw new StudioError(`שמירת יום ${DAY_NAMES[day.dayOfWeek]} נכשלה`);
      }
      continue;
    }
    const { error } = await db
      .from("business_hours")
      .update(patch)
      .in(
        "id",
        rows.map((row) => row.id),
      );
    if (error) {
      console.error("[studio] update hours:", error.message);
      throw new StudioError(`שמירת יום ${DAY_NAMES[day.dayOfWeek]} נכשלה`);
    }
  }
}

export type HeroMode = "marquee" | "single_fullbleed";

function asUrlList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

async function readHero(businessId: string) {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("business_profile")
    .select("id, home_hero_mode, home_hero_images, home_hero_single_url, home_hero_single_kind")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw new StudioError("טעינת תמונות דף הבית נכשלה");
  if (!data) throw new StudioError("העסק לא נמצא");
  return data as {
    home_hero_mode: string | null;
    home_hero_images: unknown;
    home_hero_single_url: string | null;
    home_hero_single_kind: string | null;
  };
}

export function storagePathFromPublicUrl(url: string) {
  const index = url.indexOf(PUBLIC_MARKER);
  if (index < 0) return null;
  const path = decodeURIComponent(url.slice(index + PUBLIC_MARKER.length).split("?")[0]);
  if (!path.startsWith(`${HERO_PREFIX}/`) && !path.startsWith(`${HERO_PREFIX}-single/`)) return null;
  if (path.includes("..") || path.includes("\\")) return null;
  return path;
}

async function removeStored(url: string | null | undefined) {
  if (!url) return;
  const path = storagePathFromPublicUrl(url);
  if (!path) return;
  const { error } = await getServiceSupabase().storage.from(BUCKET).remove([path]);
  if (error) console.error("[studio] remove hero file:", error.message);
}

export async function setHomeHeroMode(businessId: string, mode: HeroMode) {
  const db = getServiceSupabase();
  const { error } = await db.from("business_profile").update({ home_hero_mode: mode }).eq("id", businessId);
  if (error) throw new StudioError("עדכון סוג התצוגה נכשל");
}

export async function reorderHomeHeroImages(businessId: string, images: string[]) {
  const current = asUrlList((await readHero(businessId)).home_hero_images);
  if (images.length !== current.length || images.some((url) => !current.includes(url))) {
    throw new StudioError("סדר התמונות לא תואם את מה ששמור");
  }
  const { error } = await getServiceSupabase()
    .from("business_profile")
    .update({ home_hero_images: images, home_hero_mode: "marquee" })
    .eq("id", businessId);
  if (error) throw new StudioError("סידור התמונות נכשל");
}

export async function removeHomeHeroImage(businessId: string, url: string) {
  const current = asUrlList((await readHero(businessId)).home_hero_images);
  if (!current.includes(url)) throw new StudioError("התמונה לא נמצאה");
  const next = current.filter((item) => item !== url);
  const { error } = await getServiceSupabase()
    .from("business_profile")
    .update({ home_hero_images: next })
    .eq("id", businessId);
  if (error) throw new StudioError("מחיקת התמונה נכשלה");
  await removeStored(url);
}

export async function clearHomeHeroSingle(businessId: string) {
  const current = await readHero(businessId);
  const { error } = await getServiceSupabase()
    .from("business_profile")
    .update({ home_hero_single_url: null, home_hero_single_kind: null })
    .eq("id", businessId);
  if (error) throw new StudioError("מחיקת התמונה נכשלה");
  await removeStored(current.home_hero_single_url);
}

function extOf(file: File) {
  return MIME_EXT[file.type] ?? null;
}

async function uploadHeroFile(file: File, folder: string) {
  const ext = extOf(file);
  if (!ext) throw new StudioError("אפשר להעלות תמונה (JPG, PNG, WEBP) או סרטון (MP4, MOV, WEBM)");
  if (file.size <= 0) throw new StudioError("הקובץ ריק");
  if (file.size > MAX_BYTES) throw new StudioError("הקובץ גדול מ-40MB");
  const path = `${folder}/${Date.now()}_${randomBytes(9).toString("hex")}.${ext}`;
  const body = Buffer.from(await file.arrayBuffer());
  const db = getServiceSupabase();
  const { error } = await db.storage.from(BUCKET).upload(path, body, {
    contentType: file.type,
    upsert: false,
    cacheControl: "3600",
  });
  if (error) {
    console.error("[studio] upload hero:", error.message);
    throw new StudioError("העלאת הקובץ נכשלה");
  }
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new StudioError("העלאת הקובץ נכשלה");
  return data.publicUrl;
}

export async function addHomeHeroImages(businessId: string, files: File[]) {
  if (files.length === 0) throw new StudioError("לא נבחרו תמונות");
  if (files.length > 20) throw new StudioError("אפשר להעלות עד 20 תמונות בבת אחת");
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      if (file.type.startsWith("video/")) throw new StudioError("ברצף תמונות מעלים תמונות בלבד");
      uploaded.push(await uploadHeroFile(file, HERO_PREFIX));
    }
  } catch (error) {
    await Promise.all(uploaded.map((url) => removeStored(url)));
    throw error;
  }
  const current = asUrlList((await readHero(businessId)).home_hero_images);
  const { error } = await getServiceSupabase()
    .from("business_profile")
    .update({ home_hero_images: [...current, ...uploaded], home_hero_mode: "marquee" })
    .eq("id", businessId);
  if (error) {
    await Promise.all(uploaded.map((url) => removeStored(url)));
    throw new StudioError("שמירת התמונות נכשלה");
  }
  return uploaded;
}

export async function setHomeHeroSingle(businessId: string, file: File) {
  const url = await uploadHeroFile(file, `${HERO_PREFIX}-single`);
  const kind = file.type.startsWith("video/") ? "video" : "image";
  const previous = await readHero(businessId);
  const { error } = await getServiceSupabase()
    .from("business_profile")
    .update({
      home_hero_single_url: url,
      home_hero_single_kind: kind,
      home_hero_mode: "single_fullbleed",
    })
    .eq("id", businessId);
  if (error) {
    await removeStored(url);
    throw new StudioError("שמירת הקובץ נכשלה");
  }
  if (previous.home_hero_single_url && previous.home_hero_single_url !== url) {
    await removeStored(previous.home_hero_single_url);
  }
  return { url, kind };
}
