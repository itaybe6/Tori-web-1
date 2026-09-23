import { getServiceSupabase } from "@/lib/sms/supabase-admin";
import { fail, guardAdmin, ok, UUID_RE } from "@/lib/superadmin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const NAME_MAX = 255;
const PRICE_MAX = 100_000;
const DURATION_MAX = 24 * 60;

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await guardAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return fail("מזהה עסק לא תקין");

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = str(body.name);
  const price = Number(body.price);
  const duration = Number(body.durationMinutes);

  if (!name) return fail("יש להזין שם שירות");
  if (name.length > NAME_MAX) return fail("שם השירות ארוך מדי");
  if (!Number.isFinite(price) || price < 0 || price > PRICE_MAX) {
    return fail("יש להזין מחיר בין 0 ל-100,000");
  }
  if (!Number.isInteger(duration) || duration < 5 || duration > DURATION_MAX) {
    return fail("משך השירות צריך להיות בין 5 דקות ליממה");
  }

  const db = getServiceSupabase();

  const { data: profile, error: profileError } = await db
    .from("business_profile")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (profileError) return fail("טעינת העסק נכשלה", 500);
  if (!profile) return fail("העסק לא נמצא", 404);

  const { data: admin } = await db
    .from("users")
    .select("id")
    .eq("business_id", id)
    .eq("user_type", "admin")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const { data: last } = await db
    .from("services")
    .select("order_index")
    .eq("business_id", id)
    .order("order_index", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const orderIndex = Math.max(0, Number(last?.order_index) || 0) + 1;

  const { data: created, error } = await db
    .from("services")
    .insert({
      name,
      price,
      duration_minutes: duration,
      is_active: true,
      business_id: id,
      worker_id: admin?.id ?? null,
      order_index: orderIndex,
    })
    .select("id, name, price, duration_minutes, is_active")
    .single();

  if (error || !created) {
    console.error("[apps/services]", error?.message);
    return fail("הוספת השירות נכשלה", 500);
  }

  return ok({ service: created });
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await guardAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return fail("מזהה עסק לא תקין");

  const body = (await request.json().catch(() => ({}))) as { serviceId?: unknown };
  const serviceId = str(body.serviceId);
  if (!UUID_RE.test(serviceId)) return fail("מזהה שירות לא תקין");

  const db = getServiceSupabase();
  const { data: service, error: serviceError } = await db
    .from("services")
    .select("id, name")
    .eq("id", serviceId)
    .eq("business_id", id)
    .maybeSingle();
  if (serviceError) return fail("טעינת השירות נכשלה", 500);
  if (!service) return fail("השירות לא נמצא", 404);

  const [appointments, recurring] = await Promise.all([
    db.from("appointments").select("id", { count: "exact", head: true }).eq("business_id", id).eq("service_id", serviceId),
    db
      .from("recurring_appointments")
      .select("id", { count: "exact", head: true })
      .eq("business_id", id)
      .eq("service_id", serviceId),
  ]);
  if (appointments.error || recurring.error) return fail("בדיקת התורים של השירות נכשלה", 500);
  if ((appointments.count ?? 0) > 0 || (recurring.count ?? 0) > 0) {
    return fail("אי אפשר להסיר שירות שיש לו תורים");
  }

  const [durations, forms] = await Promise.all([
    db.from("client_service_durations").delete().eq("service_id", serviceId),
    db.from("health_form_assignments").delete().eq("service_id", serviceId),
  ]);
  if (durations.error || forms.error) {
    console.error("[apps/services] unlink:", durations.error?.message, forms.error?.message);
    return fail("הסרת השירות נכשלה", 500);
  }

  const { error } = await db.from("services").delete().eq("id", serviceId).eq("business_id", id);
  if (error) {
    console.error("[apps/services] delete:", error.message);
    return fail(error.code === "23503" ? "אי אפשר להסיר את השירות כי יש נתונים שמקושרים אליו" : "הסרת השירות נכשלה", 500);
  }

  return ok({ deleted: true });
}
