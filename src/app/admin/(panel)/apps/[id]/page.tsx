"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminJson, readFileAsDataUrl } from "@/lib/superadmin/browser";
import {
  contrastText,
  formatBytes,
  formatDateHe,
  formatSmsCredits,
  hasPulseemCredentials,
  initialOf,
} from "@/lib/superadmin/format";
import { INCLUDED_SMS } from "@/lib/superadmin/pulseem-plans";
import type { BusinessDetails, PulseemEditorState } from "@/lib/superadmin/types";
import { HomeHeroPanel, HoursPanel } from "./studio-panels";

type Banner = { kind: "success" | "error"; text: string } | null;

const TOPUP_PRESETS = [100, 250, 500, 1000] as const;
const LOW_BALANCE = 200;
const MAX_TRANSFER = 10_000;

export default function AppDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const businessId = params.id;
  const [details, setDetails] = useState<BusinessDetails | null>(null);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState<Banner>(null);
  const [copied, setCopied] = useState(false);

  const fetchDetails = useCallback(
    () => adminJson<BusinessDetails & { ok: true }>(`/api/admin/apps/${businessId}`),
    [businessId],
  );

  const load = useCallback(() => fetchDetails().then(setDetails), [fetchDetails]);

  useEffect(() => {
    let cancelled = false;
    fetchDetails()
      .then((data) => {
        if (!cancelled) setDetails(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "טעינת העסק נכשלה");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchDetails]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 7000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  const notify = useCallback(
    (text: string, kind: "success" | "error" = "success") => {
      setBanner({ kind, text });
      load().catch(() => undefined);
    },
    [load],
  );

  if (error) return <p className="admin-error">{error}</p>;
  if (!details?.profile) return <p className="admin-note">טוען…</p>;

  const profile = details.profile;
  const name = String(profile.display_name || "ללא שם");
  const phone = typeof profile.phone === "string" && profile.phone ? profile.phone : null;
  const primaryColor = typeof profile.primary_color === "string" ? profile.primary_color : null;
  const iconFile = details.brandingFiles.find((file) => file.name === "icon.png");
  const pulseemReady = hasPulseemCredentials({
    pulseemHasApiKey: profile.pulseem_has_api_key === true,
    pulseem_user_id: typeof profile.pulseem_user_id === "string" ? profile.pulseem_user_id : null,
    pulseemHasPassword: profile.pulseem_has_password === true,
  });
  const clients = details.users.filter((user) => user.user_type === "client");
  const admins = details.users.filter((user) => user.user_type === "admin");
  const activeServices = details.services.filter((service) => service.is_active).length;

  async function copyId() {
    try {
      await navigator.clipboard.writeText(businessId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setBanner({ kind: "error", text: "לא ניתן להעתיק את המזהה" });
    }
  }

  return (
    <>
      <header className="admin-app-hero">
        <div>
          <Link href="/admin/apps" className="admin-back">
            <span aria-hidden>→</span> כל האפליקציות
          </Link>
          <div className="admin-app-identity">
            <div
              className="admin-app-avatar"
              style={primaryColor ? { background: primaryColor, color: contrastText(primaryColor) } : undefined}
            >
              {iconFile ? <img src={iconFile.publicUrl} alt="" /> : initialOf(name)}
            </div>
            <div>
              <h1 className="admin-title">{name}</h1>
              <div className="admin-app-meta">
                {phone ? <span dir="ltr">{phone}</span> : null}
                <span dir="ltr">{details.brandingFolder || "בלי תיקיית מיתוג"}</span>
                <span>נוצר {formatDateHe(String(profile.created_at || ""))}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="admin-app-hero-side">
          <span className={`admin-status ${pulseemReady ? "is-paid" : "is-pending"}`}>
            {pulseemReady ? "פולסים מחובר" : "פולסים לא מחובר"}
          </span>
          <button className="admin-chip" type="button" onClick={() => void copyId()} title={businessId}>
            {copied ? "הועתק ✓" : "העתקת מזהה"}
          </button>
        </div>
      </header>

      {banner ? (
        <div className={`admin-banner is-${banner.kind}`} role="status">
          <span>{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} aria-label="סגירה">
            ✕
          </button>
        </div>
      ) : null}

      <div className="admin-app-grid">
        <SmsCard businessId={businessId} displayName={name} pulseemReady={pulseemReady} onChange={notify} />

        <aside className="admin-side-stats">
          <div className="admin-side-stat">
            <span>
              לקוחות
              <small>רשומים באפליקציה</small>
            </span>
            <strong>{clients.length}</strong>
          </div>
          <div className="admin-side-stat">
            <span>
              מנהלים
              <small>{admins[0]?.phone ? <span dir="ltr">{admins[0].phone}</span> : "אין מנהל"}</small>
            </span>
            <strong>{admins.length}</strong>
          </div>
          <div className="admin-side-stat">
            <span>
              שירותים
              <small>{activeServices} פעילים</small>
            </span>
            <strong>{details.services.length}</strong>
          </div>
          <div className="admin-side-stat">
            <span>
              קבצי מיתוג
              <small>{details.brandingFolder ? "תיקייה קיימת" : "אין תיקייה"}</small>
            </span>
            <strong>{details.brandingFiles.length}</strong>
          </div>
        </aside>
      </div>

      <HoursPanel businessId={businessId} admins={admins} hours={details.hours ?? []} onSaved={notify} />
      <HomeHeroPanel businessId={businessId} profile={profile} onSaved={notify} />

      <section className="admin-card">
        <div className="admin-card-head">
          <h2>משתמשים</h2>
          <span className="admin-count">{details.users.length}</span>
        </div>
        {details.users.length === 0 ? (
          <div className="admin-empty">אין משתמשים עדיין</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>טלפון</th>
                  <th>סוג</th>
                  <th>נרשם</th>
                </tr>
              </thead>
              <tbody>
                {details.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="admin-user-cell">
                        <div className="admin-mini-avatar">
                          {user.image_url ? <img src={user.image_url} alt="" /> : initialOf(user.name)}
                        </div>
                        <span>{user.name || "—"}</span>
                      </div>
                    </td>
                    <td dir="ltr">{user.phone || "—"}</td>
                    <td>
                      <span className={`admin-status ${user.user_type === "admin" ? "is-paid" : "is-info"}`}>
                        {user.user_type === "admin" ? "מנהל" : user.user_type === "client" ? "לקוח" : user.user_type || "—"}
                      </span>
                    </td>
                    <td>{formatDateHe(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <h2>שירותים</h2>
          <span className="admin-count">{details.services.length}</span>
        </div>
        <AddServiceForm businessId={businessId} onAdded={notify} />
        {details.services.length === 0 ? (
          <div className="admin-empty">אין שירותים עדיין</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>מחיר</th>
                  <th>משך</th>
                  <th>סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {details.services.map((service) => (
                  <tr key={service.id}>
                    <td>{service.name || "—"}</td>
                    <td dir="ltr" style={{ textAlign: "start" }}>
                      {service.price != null ? `₪${service.price.toLocaleString("he-IL")}` : "—"}
                    </td>
                    <td>{service.duration_minutes != null ? `${service.duration_minutes} דק׳` : "—"}</td>
                    <td>
                      <span className={`admin-status ${service.is_active ? "is-paid" : ""}`}>
                        {service.is_active ? "פעיל" : "לא פעיל"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <BrandingPanel businessId={businessId} details={details} onUploaded={notify} />

      <DeletePanel businessId={businessId} name={name} onDeleted={() => router.push("/admin/apps")} />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * SMS balance + top-up
 * ------------------------------------------------------------------ */

function SmsCard({
  businessId,
  displayName,
  pulseemReady,
  onChange,
}: {
  businessId: string;
  displayName: string;
  pulseemReady: boolean;
  onChange: (message: string, kind?: "success" | "error") => void;
}) {
  const [state, setState] = useState<PulseemEditorState | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [busy, setBusy] = useState("");
  const [preset, setPreset] = useState<number | null>(500);
  const [custom, setCustom] = useState("");
  const [lastTopup, setLastTopup] = useState<{ amount: number; after: number | null } | null>(null);

  // Advanced / connection fields
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [sender, setSender] = useState("");

  const hasAccount = Boolean(state?.hasApiKey || (state?.userId && state.hasPassword)) || pulseemReady;

  const fetchBalance = useCallback(async () => {
    const data = await adminJson<{ directSmsCredits?: string }>("/api/admin/pulseem/balance", {
      method: "POST",
      body: JSON.stringify({ businessId, subAccountName: displayName }),
    });
    const parsed = Number(data.directSmsCredits);
    return Number.isFinite(parsed) ? parsed : null;
  }, [businessId, displayName]);

  const fetchState = useCallback(
    () =>
      adminJson<{ state: PulseemEditorState }>("/api/admin/pulseem/state", {
        method: "POST",
        body: JSON.stringify({ businessId }),
      }).then((data) => data.state),
    [businessId],
  );

  const applyState = useCallback((next: PulseemEditorState) => {
    setState(next);
    setUserId(next.userId);
    setSender(next.fromNumber);
  }, []);

  const applyBalance = useCallback((promise: Promise<number | null>) => {
    return promise
      .then((value) => {
        setBalance(value);
        setBalanceError("");
        setRefreshedAt(new Date());
      })
      .catch((err: unknown) => {
        setBalanceError(err instanceof Error ? err.message : "לא ניתן לטעון יתרה");
      })
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    fetchState().then(applyState).catch(() => undefined);
    void applyBalance(fetchBalance());
  }, [fetchState, fetchBalance, applyState, applyBalance]);

  function loadBalance() {
    setRefreshing(true);
    return applyBalance(fetchBalance());
  }

  function loadState() {
    return fetchState().then(applyState);
  }

  const amount = useMemo(() => {
    if (preset != null) return preset;
    const n = Number(custom);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }, [preset, custom]);

  const amountValid = amount > 0 && amount <= MAX_TRANSFER;
  const pct = balance == null ? 0 : Math.max(0, Math.min(100, (balance / INCLUDED_SMS) * 100));
  const tone = balance == null ? "" : balance < LOW_BALANCE ? "is-low" : balance < INCLUDED_SMS / 2 ? "is-mid" : "";

  async function run(label: string, action: () => Promise<string>) {
    setBusy(label);
    try {
      const text = await action();
      onChange(text);
      await Promise.all([loadState().catch(() => undefined), loadBalance()]);
    } catch (err) {
      onChange(err instanceof Error ? err.message : "הפעולה נכשלה", "error");
    } finally {
      setBusy("");
    }
  }

  function topUp() {
    if (!amountValid) return;
    void run("transfer", async () => {
      const data = await adminJson<{ smsCreditsAfter?: number | null }>("/api/admin/pulseem/transfer", {
        method: "POST",
        body: JSON.stringify({ businessId, smsCredits: amount }),
      });
      // Pulseem does not always echo the new balance; fall back to a fresh read.
      const after =
        typeof data.smsCreditsAfter === "number" ? data.smsCreditsAfter : await fetchBalance().catch(() => null);
      setLastTopup({ amount, after });
      return `הוטענו ${amount.toLocaleString("he-IL")} הודעות ל${displayName}${
        after != null ? ` · יתרה חדשה: ${after.toLocaleString("he-IL")}` : ""
      }`;
    });
  }

  return (
    <section className="admin-sms-card">
      <div className="admin-sms-head">
        <div>
          <h2>יתרת הודעות SMS</h2>
          <p>
            {!hasAccount
              ? "אין חשבון פולסים מחובר"
              : refreshedAt
                ? `עודכן ${refreshedAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`
                : "טוען יתרה מפולסים…"}
          </p>
        </div>
        <button
          className={`admin-icon-btn ${refreshing ? "is-spinning" : ""}`}
          type="button"
          onClick={() => void loadBalance()}
          disabled={refreshing}
          aria-label="רענון יתרה"
          title="רענון יתרה"
        >
          ↻
        </button>
      </div>

      {hasAccount ? (
        <>
          <div className={`admin-sms-balance ${tone}`}>
            {balance == null && refreshing ? (
              <div className="admin-sms-skeleton" />
            ) : balance == null ? (
              <strong>—</strong>
            ) : (
              <strong>{formatSmsCredits(String(balance))}</strong>
            )}
            <span>הודעות זמינות</span>
          </div>
          <div className={`admin-sms-bar ${tone}`} aria-hidden>
            <i style={{ width: `${pct}%` }} />
          </div>
          <p className="admin-sms-caption">
            <span>
              {balance == null
                ? `${INCLUDED_SMS.toLocaleString("he-IL")} הודעות כלולות בחודש`
                : balance >= INCLUDED_SMS
                  ? `${(balance - INCLUDED_SMS).toLocaleString("he-IL")}+ מעבר ל-${INCLUDED_SMS.toLocaleString("he-IL")} הכלולות`
                  : balance < LOW_BALANCE
                    ? "יתרה נמוכה — כדאי להטעין"
                    : `${Math.round(pct)}% מהחבילה החודשית`}
            </span>
            <span>מתחדש ל-{INCLUDED_SMS.toLocaleString("he-IL")} בכל 1 לחודש</span>
          </p>
          {balanceError ? <p className="admin-sms-error">{balanceError}</p> : null}

          <div className="admin-sms-topup">
            <h3>הטענת הודעות</h3>
            <div className="admin-sms-presets">
              {TOPUP_PRESETS.map((value) => (
                <button
                  key={value}
                  className="admin-chip"
                  type="button"
                  aria-pressed={preset === value}
                  dir="ltr"
                  onClick={() => {
                    setPreset(value);
                    setCustom("");
                  }}
                >
                  +{value.toLocaleString("he-IL")}
                </button>
              ))}
              <input
                className="admin-sms-custom"
                dir="ltr"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_TRANSFER}
                placeholder="כמות אחרת"
                value={custom}
                onFocus={() => setPreset(null)}
                onChange={(event) => {
                  setPreset(null);
                  setCustom(event.target.value);
                }}
              />
            </div>
            <div className="admin-sms-submit">
              <button className="admin-btn-lime" type="button" disabled={busy !== "" || !amountValid} onClick={topUp}>
                {busy === "transfer"
                  ? "מטעין…"
                  : amountValid
                    ? `הטענת ${amount.toLocaleString("he-IL")} הודעות`
                    : "בחרי כמות להטענה"}
              </button>
              {lastTopup ? (
                <p className="admin-sms-after">
                  הוטענו <b dir="ltr">+{lastTopup.amount.toLocaleString("he-IL")}</b>
                  {lastTopup.after != null ? (
                    <>
                      {" "}
                      · יתרה: <b>{lastTopup.after.toLocaleString("he-IL")}</b>
                    </>
                  ) : null}
                </p>
              ) : amount > MAX_TRANSFER ? (
                <p className="admin-sms-after">מקסימום {MAX_TRANSFER.toLocaleString("he-IL")} בהעברה אחת</p>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <div className="admin-sms-empty">
          <h3>לעסק אין חשבון פולסים מחובר</h3>
          <p>
            תת-חשבון פולסים נוצר אוטומטית בעת יצירת אפליקציה חדשה. אם לעסק זה יש כבר חשבון, אפשר להזין את
            פרטי החיבור שלו ב״הגדרות חיבור מתקדמות״ למטה.
          </p>
        </div>
      )}

      <details className="admin-advanced">
        <summary>הגדרות חיבור מתקדמות</summary>
        <div className="admin-advanced-body">
          <div className="admin-advanced-block">
            <h4>פרטי חיבור (WS)</h4>
            <p>המפתחות נשמרים מוצפנים ומסונכרנים לקובץ ה-.env של המיתוג.</p>
            <div className="admin-grid-form">
              <label className="admin-field">
                מזהה משתמש
                <input dir="ltr" value={userId} onChange={(event) => setUserId(event.target.value)} />
              </label>
              <label className="admin-field">
                סיסמה
                <input
                  dir="ltr"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={state?.hasPassword ? "שמורה — השאר ריק כדי לא לשנות" : ""}
                />
              </label>
              <label className="admin-field">
                מספר שולח
                <input dir="ltr" value={sender} onChange={(event) => setSender(event.target.value)} />
              </label>
            </div>
            <div className="admin-actions">
              <button
                className="admin-btn"
                type="button"
                disabled={busy !== ""}
                onClick={() =>
                  void run("save", async () => {
                    await adminJson("/api/admin/pulseem/save", {
                      method: "POST",
                      body: JSON.stringify({ businessId, userId, password, fromNumber: sender }),
                    });
                    setPassword("");
                    return "פרטי פולסים נשמרו וסונכרנו ל-.env";
                  })
                }
              >
                {busy === "save" ? "שומר…" : "שמירה"}
              </button>
              <button
                className="admin-btn-ghost"
                type="button"
                disabled={busy !== ""}
                onClick={() =>
                  void run("test", async () => {
                    const data = await adminJson<{ credits?: string; balanceNote?: string | null }>(
                      "/api/admin/pulseem/test",
                      {
                        method: "POST",
                        body: JSON.stringify({ businessId, userId, password, subAccountName: displayName }),
                      },
                    );
                    return `החיבור תקין · יתרה: ${formatSmsCredits(data.credits) ?? "—"}${
                      data.balanceNote ? ` · ${data.balanceNote}` : ""
                    }`;
                  })
                }
              >
                {busy === "test" ? "בודק…" : "בדיקת חיבור"}
              </button>
            </div>
          </div>

        </div>
      </details>
    </section>
  );
}

function AddServiceForm({
  businessId,
  onAdded,
}: {
  businessId: string;
  onAdded: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("60");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const priceNumber = Number(price);
  const durationNumber = Number(duration);
  const valid =
    name.trim().length > 0 &&
    Number.isFinite(priceNumber) &&
    priceNumber >= 0 &&
    Number.isInteger(durationNumber) &&
    durationNumber >= 5;

  async function submit() {
    if (!valid) return;
    setPending(true);
    setError("");
    try {
      await adminJson(`/api/admin/apps/${businessId}/services`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          price: priceNumber,
          durationMinutes: durationNumber,
        }),
      });
      setName("");
      setPrice("");
      setDuration("60");
      onAdded(`השירות "${name.trim()}" נוסף`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הוספת השירות נכשלה");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="admin-service-add"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="admin-field">
        שם השירות
        <input value={name} maxLength={255} onChange={(event) => setName(event.target.value)} placeholder="למשל: הרמת גבות" />
      </label>
      <label className="admin-field">
        מחיר (₪)
        <input
          dir="ltr"
          type="number"
          inputMode="decimal"
          min={0}
          max={100000}
          step="1"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          placeholder="0"
        />
      </label>
      <label className="admin-field">
        משך (דקות)
        <input
          dir="ltr"
          type="number"
          inputMode="numeric"
          min={5}
          max={1440}
          step="5"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
        />
      </label>
      <button className="admin-btn" type="submit" disabled={pending || !valid}>
        {pending ? "מוסיף…" : "הוספת שירות"}
      </button>
      {error ? <p className="admin-error">{error}</p> : null}
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * Branding
 * ------------------------------------------------------------------ */

const IMAGE_RE = /\.(png|jpe?g|webp|gif|svg)$/i;

function BrandingPanel({
  businessId,
  details,
  onUploaded,
}: {
  businessId: string;
  details: BusinessDetails;
  onUploaded: (message: string) => void;
}) {
  const [logo, setLogo] = useState<File | null>(null);
  const [icon, setIcon] = useState<File | null>(null);
  const [splash, setSplash] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const images = details.brandingFiles.filter((file) => IMAGE_RE.test(file.name));
  const textFiles = details.brandingFiles.filter((file) => !IMAGE_RE.test(file.name));
  const hasSelection = Boolean(logo || icon || splash);

  async function upload() {
    setPending(true);
    setError("");
    try {
      const result = await adminJson<{ uploaded: string[] }>(`/api/admin/apps/${businessId}/branding`, {
        method: "POST",
        body: JSON.stringify({
          logoBase64: logo ? await readFileAsDataUrl(logo) : undefined,
          iconBase64: icon ? await readFileAsDataUrl(icon) : undefined,
          splashBase64: splash ? await readFileAsDataUrl(splash) : undefined,
        }),
      });
      onUploaded(`הועלו: ${result.uploaded.join(", ")}`);
      setLogo(null);
      setIcon(null);
      setSplash(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "העלאה נכשלה");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <h2>מיתוג</h2>
        <span className="admin-note" dir="ltr">
          {details.brandingFolder || "אין תיקייה"}
        </span>
      </div>

      {images.length > 0 ? (
        <div className="admin-branding-grid">
          {images.map((file) => (
            <a key={file.path} className="admin-branding-tile" href={file.publicUrl} target="_blank" rel="noreferrer">
              <div className="admin-branding-preview">
                <img src={`${file.publicUrl}?v=${encodeURIComponent(file.updatedAt ?? "")}`} alt={file.name} />
              </div>
              <strong>{file.name}</strong>
              <span>{formatBytes(file.size)}</span>
            </a>
          ))}
        </div>
      ) : null}

      {textFiles.length > 0 ? (
        <div className="admin-branding-files">
          {textFiles.map((file) => (
            <details key={file.path}>
              <summary>
                {file.name} · {formatBytes(file.size)}
              </summary>
              {file.content ? (
                <pre className="admin-pre" dir="ltr">
                  {file.content}
                </pre>
              ) : (
                <a href={file.publicUrl} target="_blank" rel="noreferrer">
                  פתיחת הקובץ
                </a>
              )}
            </details>
          ))}
        </div>
      ) : null}

      {details.brandingFiles.length === 0 ? <div className="admin-empty">אין קבצי מיתוג עדיין</div> : null}

      <div className="admin-grid-form">
        <label className="admin-field">
          לוגו
          <input type="file" accept="image/*" onChange={(event) => setLogo(event.target.files?.[0] ?? null)} />
        </label>
        <label className="admin-field">
          אייקון
          <input type="file" accept="image/*" onChange={(event) => setIcon(event.target.files?.[0] ?? null)} />
        </label>
        <label className="admin-field">
          ספלאש
          <input type="file" accept="image/*" onChange={(event) => setSplash(event.target.files?.[0] ?? null)} />
        </label>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      <button className="admin-btn" type="button" disabled={pending || !hasSelection} onClick={() => void upload()}>
        {pending ? "מעלה…" : "עדכון תמונות"}
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Danger zone
 * ------------------------------------------------------------------ */

function DeletePanel({
  businessId,
  name,
  onDeleted,
}: {
  businessId: string;
  name: string;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");

  async function remove() {
    setPending(true);
    setError("");
    try {
      const result = await adminJson<{
        success?: boolean;
        deletedRows?: Record<string, number>;
        tableErrors?: Record<string, string>;
        brandingFolderDeleted?: boolean;
        pulseem?: { deleted?: boolean; skipped?: boolean; error?: string };
      }>(`/api/admin/apps/${businessId}`, { method: "DELETE" });
      const rows = Object.entries(result.deletedRows ?? {})
        .map(([table, count]) => `${table}: ${count}`)
        .join(", ");
      const problems = Object.entries(result.tableErrors ?? {})
        .map(([table, message]) => `${table}: ${message}`)
        .join(" · ");
      setSummary(
        `${result.success ? "העסק נמחק" : "המחיקה לא הושלמה"}. פולסים: ${
          result.pulseem?.deleted ? "נמחק" : result.pulseem?.error || (result.pulseem?.skipped ? "דולג" : "—")
        }. תיקיית מיתוג: ${result.brandingFolderDeleted ? "נמחקה" : "לא נמחקה"}. ${rows}${
          problems ? ` שגיאות: ${problems}` : ""
        }`,
      );
      if (result.success) onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "המחיקה נכשלה");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="admin-card admin-danger">
      <summary className="admin-card-head">
        <h2>מחיקת עסק</h2>
        <span className="admin-note">פעולה בלתי הפיכה</span>
      </summary>
      <p className="admin-note">
        נמחקים תת-חשבון הפולסים, כל הנתונים של האפליקציה וקבצי המיתוג. להמשך הקלד את שם העסק: <b>{name}</b>
      </p>
      <div className="admin-danger-row">
        <label className="admin-field">
          שם העסק לאישור
          <input value={typed} onChange={(event) => setTyped(event.target.value)} />
        </label>
        <button
          className="admin-btn admin-btn-danger"
          type="button"
          disabled={pending || typed.trim() !== name.trim()}
          onClick={() => void remove()}
        >
          {pending ? "מוחק…" : "מחק עסק"}
        </button>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      {summary ? <p className="admin-note">{summary}</p> : null}
    </details>
  );
}
