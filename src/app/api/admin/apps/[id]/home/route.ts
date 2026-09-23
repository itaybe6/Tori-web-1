import {
  addHomeHeroImages,
  clearHomeHeroSingle,
  removeHomeHeroImage,
  reorderHomeHeroImages,
  setHomeHeroMode,
  setHomeHeroSingle,
  StudioError,
  type HeroMode,
} from "@/lib/superadmin/app-studio";
import { fail, guardAdmin, ok, UUID_RE } from "@/lib/superadmin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

function studioFail(error: unknown) {
  if (error instanceof StudioError) return fail(error.message);
  console.error("[apps/home]", error);
  return fail("עדכון תמונות דף הבית נכשל", 500);
}

function isMode(value: unknown): value is HeroMode {
  return value === "marquee" || value === "single_fullbleed";
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await guardAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return fail("מזהה עסק לא תקין");

  const form = await request.formData().catch(() => null);
  if (!form) return fail("לא התקבלו קבצים");
  const target = String(form.get("target") ?? "");
  const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  try {
    if (target === "marquee") {
      const uploaded = await addHomeHeroImages(id, files);
      return ok({ uploaded });
    }
    if (target === "single") {
      if (files.length !== 1) return fail("בחרי תמונה או סרטון אחד");
      const saved = await setHomeHeroSingle(id, files[0]);
      return ok(saved);
    }
    return fail("סוג ההעלאה לא תקין");
  } catch (error) {
    return studioFail(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await guardAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return fail("מזהה עסק לא תקין");

  const body = (await request.json().catch(() => ({}))) as { mode?: unknown; images?: unknown };
  try {
    if (isMode(body.mode) && body.images === undefined) {
      await setHomeHeroMode(id, body.mode);
      return ok({ saved: true });
    }
    if (Array.isArray(body.images) && body.images.every((item) => typeof item === "string")) {
      await reorderHomeHeroImages(id, body.images);
      return ok({ saved: true });
    }
    return fail("לא נשלח עדכון");
  } catch (error) {
    return studioFail(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await guardAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return fail("מזהה עסק לא תקין");

  const body = (await request.json().catch(() => ({}))) as { url?: unknown; clearSingle?: unknown };
  try {
    if (body.clearSingle === true) {
      await clearHomeHeroSingle(id);
      return ok({ saved: true });
    }
    if (typeof body.url === "string" && body.url.trim()) {
      await removeHomeHeroImage(id, body.url.trim());
      return ok({ saved: true });
    }
    return fail("לא נבחרה תמונה למחיקה");
  } catch (error) {
    return studioFail(error);
  }
}
