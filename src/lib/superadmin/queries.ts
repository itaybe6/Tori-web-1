import { getServiceSupabase } from '@/lib/sms/supabase-admin';
import { brandingAssetUrl, readableAdminPassword } from '@/lib/superadmin/format';
import type {
  BrandingFile,
  BusinessDetails,
  BusinessHourRow,
  BusinessOverview,
  BusinessServiceRow,
  BusinessStats,
  BusinessUserRow,
  PulseemEditorState,
} from '@/lib/superadmin/types';
import {
  BRANDING_BUCKET,
  TEXT_BRANDING_FILES,
  brandingPublicUrl,
  downloadBrandingFileText,
  listBrandingFolder,
  resolveBrandingClientName,
} from './storage';

const PROFILE_LIST_COLUMNS =
  'id, display_name, address, phone, primary_color, created_at, branding_client_name, pulseem_user_id, pulseem_from_number, pulseem_has_password, pulseem_has_api_key';

interface ProfileRow {
  id: string;
  display_name: string | null;
  address: string | null;
  phone: string | null;
  primary_color: string | null;
  created_at: string;
  branding_client_name: string | null;
  pulseem_user_id: string | null;
  pulseem_from_number: string | null;
  pulseem_has_password: boolean | null;
  pulseem_has_api_key: boolean | null;
}

interface UserCountRow {
  business_id: string;
  user_type: string | null;
  phone: string | null;
  password_hash: string | null;
}

/**
 * Ported from `superAdminApi.getAllBusinesses`.
 *
 * `messages` has no aggregate endpoint here, so rows are paged in 1000-row
 * batches and tallied per business — same as the RN app.
 */
export async function getAllBusinesses(): Promise<BusinessOverview[]> {
  const db = getServiceSupabase();

  const { data: profiles, error } = await db
    .from('business_profile')
    .select(PROFILE_LIST_COLUMNS)
    .order('created_at', { ascending: false });

  if (error || !profiles) {
    console.error('[queries] getAllBusinesses profiles:', error?.message);
    return [];
  }

  const rows = profiles as unknown as ProfileRow[];
  const businessIds = rows.map((p) => p.id);
  if (businessIds.length === 0) return [];

  const { data: users, error: usersError } = await db
    .from('users')
    .select('business_id, user_type, phone, password_hash')
    .in('business_id', businessIds);

  if (usersError) console.error('[queries] user counts:', usersError.message);

  const messageCountByBusiness: Record<string, number> = {};
  for (const id of businessIds) messageCountByBusiness[id] = 0;

  const PAGE = 1000;
  for (let offset = 0; offset < 500_000; offset += PAGE) {
    const { data: batch, error: messagesError } = await db
      .from('messages')
      .select('business_id')
      .in('business_id', businessIds)
      .range(offset, offset + PAGE - 1);

    if (messagesError) {
      console.error('[queries] message counts:', messagesError.message);
      break;
    }
    if (!batch?.length) break;

    for (const row of batch as { business_id?: string }[]) {
      const bid = row.business_id;
      if (bid && messageCountByBusiness[bid] !== undefined) messageCountByBusiness[bid]++;
    }
    if (batch.length < PAGE) break;
  }

  const countMap: Record<
    string,
    { clients: number; admins: number; adminPhone: string | null; adminPassword: string | null }
  > = {};

  for (const u of (users ?? []) as UserCountRow[]) {
    if (!countMap[u.business_id]) {
      countMap[u.business_id] = { clients: 0, admins: 0, adminPhone: null, adminPassword: null };
    }
    if (u.user_type === 'client') {
      countMap[u.business_id].clients++;
    } else if (u.user_type === 'admin') {
      countMap[u.business_id].admins++;
      // First admin encountered supplies the login credentials shown on the card.
      if (!countMap[u.business_id].adminPhone) {
        countMap[u.business_id].adminPhone = u.phone || null;
        countMap[u.business_id].adminPassword = readableAdminPassword(u.password_hash);
      }
    }
  }

  return rows.map((p) => ({
    id: p.id,
    display_name: p.display_name,
    address: p.address,
    phone: p.phone,
    primary_color: p.primary_color,
    created_at: p.created_at,
    branding_client_name: p.branding_client_name ?? null,
    iconUrl: brandingAssetUrl(p.branding_client_name, 'icon.png'),
    logoUrl: brandingAssetUrl(p.branding_client_name, 'logo.png'),
    pulseem_user_id: p.pulseem_user_id ?? null,
    pulseem_from_number: p.pulseem_from_number ?? null,
    pulseemHasPassword: !!p.pulseem_has_password,
    pulseemHasApiKey: !!p.pulseem_has_api_key,
    clientCount: countMap[p.id]?.clients ?? 0,
    adminCount: countMap[p.id]?.admins ?? 0,
    broadcastMessageCount: messageCountByBusiness[p.id] ?? 0,
    adminPhone: countMap[p.id]?.adminPhone ?? null,
    adminPassword: countMap[p.id]?.adminPassword ?? null,
  }));
}

export function statsFromBusinesses(businesses: BusinessOverview[]): BusinessStats {
  return businesses.reduce<BusinessStats>(
    (acc, b) => ({
      businesses: acc.businesses + 1,
      clients: acc.clients + b.clientCount,
      admins: acc.admins + b.adminCount,
    }),
    { businesses: 0, clients: 0, admins: 0 },
  );
}

/** Ported from `superAdminApi.getBusinessDetails`, plus the Storage branding listing. */
export async function getBusinessDetails(businessId: string): Promise<BusinessDetails | null> {
  const db = getServiceSupabase();

  const [profileRes, usersRes, servicesRes, hoursRes] = await Promise.all([
    db.from('business_profile').select('*').eq('id', businessId).maybeSingle(),
    db
      .from('users')
      .select('id, name, phone, user_type, created_at, image_url')
      .eq('business_id', businessId)
      .order('created_at'),
    db
      .from('services')
      .select('id, name, price, duration_minutes, is_active, order_index')
      .eq('business_id', businessId)
      .order('name'),
    db
      .from('business_hours')
      .select(
        'id, user_id, day_of_week, start_time, end_time, is_active, slot_duration_minutes, breaks, break_start_time, break_end_time',
      )
      .eq('business_id', businessId)
      .order('day_of_week'),
  ]);

  if (profileRes.error) {
    console.error('[queries] getBusinessDetails profile:', profileRes.error.message);
    return null;
  }
  if (!profileRes.data) return null;
  if (hoursRes.error) {
    console.error('[queries] getBusinessDetails hours:', hoursRes.error.message);
  }

  const profile = profileRes.data as Record<string, unknown>;
  const hint = (profile.branding_client_name as string | null) ?? null;
  const brandingFolder = await resolveBrandingClientName(businessId, hint);
  const brandingFiles = brandingFolder ? await loadBrandingFiles(brandingFolder) : [];

  return {
    profile,
    users: (usersRes.data ?? []) as BusinessUserRow[],
    services: (servicesRes.data ?? []) as BusinessServiceRow[],
    hours: hoursRes.error ? [] : ((hoursRes.data ?? []) as BusinessHourRow[]),
    brandingFiles,
    brandingFolder,
  };
}

async function loadBrandingFiles(clientName: string): Promise<BrandingFile[]> {
  const entries = await listBrandingFolder(clientName);

  const files = await Promise.all(
    entries
      .filter((e) => !!e.name && e.name !== '.emptyFolderPlaceholder')
      .map(async (entry): Promise<BrandingFile> => {
        const isText = (TEXT_BRANDING_FILES as readonly string[]).includes(entry.name);
        const content = isText ? await downloadBrandingFileText(clientName, entry.name) : null;
        const meta = entry.metadata as { size?: number } | null | undefined;

        return {
          name: entry.name,
          path: `branding/${clientName}/${entry.name}`,
          publicUrl: brandingPublicUrl(clientName, entry.name),
          size: meta?.size ?? null,
          updatedAt: entry.updated_at ?? entry.created_at ?? null,
          content,
        };
      }),
  );

  // .env first, then configs, then images — the order an operator reads them in.
  const rank = (n: string) =>
    n === '.env' ? 0 : n === 'app.config.json' ? 1 : n === 'theme.json' ? 2 : 3;
  return files.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/** Ported from `superAdminApi.getPulseemEditorState`, extended with the fields the modal needs. */
export async function getPulseemEditorState(
  businessId: string,
): Promise<PulseemEditorState | null> {
  const db = getServiceSupabase();

  const { data, error } = await db
    .from('business_profile')
    .select(
      'display_name, branding_client_name, pulseem_user_id, pulseem_from_number, pulseem_has_password, pulseem_has_api_key',
    )
    .eq('id', businessId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    display_name: string | null;
    branding_client_name: string | null;
    pulseem_user_id: string | null;
    pulseem_from_number: string | null;
    pulseem_has_password: boolean | null;
    pulseem_has_api_key: boolean | null;
  };

  return {
    userId: row.pulseem_user_id?.trim() || '',
    fromNumber: row.pulseem_from_number?.trim() || '',
    hasPassword: !!row.pulseem_has_password,
    hasApiKey: !!row.pulseem_has_api_key,
    displayName: row.display_name,
    brandingClientName: row.branding_client_name,
  };
}

export { BRANDING_BUCKET };
