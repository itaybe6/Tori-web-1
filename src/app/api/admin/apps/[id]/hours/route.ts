import { saveManagerHours, StudioError, type ManagerDayInput } from "@/lib/superadmin/app-studio";
import { fail, guardAdmin, ok, UUID_RE } from "@/lib/superadmin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await guardAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return fail("מזהה עסק לא תקין");

  const body = (await request.json().catch(() => ({}))) as { userId?: unknown; days?: unknown };
  const userId = str(body.userId);
  if (!UUID_RE.test(userId)) return fail("מזהה המנהלת לא תקין");
  if (!Array.isArray(body.days)) return fail("חסרות שעות");

  const days: ManagerDayInput[] = body.days.map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      dayOfWeek: Number(row.dayOfWeek),
      isActive: row.isActive === true,
      startTime: str(row.startTime),
      endTime: str(row.endTime),
      breakStart: str(row.breakStart),
      breakEnd: str(row.breakEnd),
    };
  });

  try {
    await saveManagerHours(id, userId, days);
    return ok({ saved: true });
  } catch (error) {
    if (error instanceof StudioError) return fail(error.message);
    console.error("[apps/hours]", error);
    return fail("שמירת השעות נכשלה", 500);
  }
}
