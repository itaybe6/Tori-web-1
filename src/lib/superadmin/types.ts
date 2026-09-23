/** Mirrors `BusinessOverview` in the RN app (lib/api/superAdmin.ts). */
export interface BusinessOverview {
  id: string;
  display_name: string | null;
  address: string | null;
  phone: string | null;
  primary_color: string | null;
  created_at: string;
  branding_client_name: string | null;
  /** Public Storage URL for `icon.png` — may 404 if the file was never uploaded. */
  iconUrl: string | null;
  /** Public Storage URL for `logo.png` — may 404 if the file was never uploaded. */
  logoUrl: string | null;
  clientCount: number;
  adminCount: number;
  /** Rows in `messages` (home-screen broadcasts) — NOT the SMS balance. */
  broadcastMessageCount: number;
  adminPhone: string | null;
  /** Decoded from `password_hash`; null when the hash format is unknown. */
  adminPassword: string | null;
  pulseem_user_id: string | null;
  pulseem_from_number: string | null;
  pulseemHasPassword: boolean;
  pulseemHasApiKey: boolean;
}

/** Remaining Direct SMS credits for a business, loaded from Pulseem (not the DB). */
export type SmsBalanceState =
  | { status: 'loading' }
  | { status: 'ready'; credits: string }
  | { status: 'empty' }
  | { status: 'error'; message: string };

export interface BusinessStats {
  businesses: number;
  clients: number;
  admins: number;
}

export interface BusinessUserRow {
  id: string;
  name: string | null;
  phone: string | null;
  user_type: string | null;
  created_at: string | null;
  image_url?: string | null;
}

export interface BusinessServiceRow {
  id: string;
  name: string | null;
  price: number | null;
  duration_minutes: number | null;
  is_active: boolean | null;
  order_index?: number | null;
}

export interface BrandingFile {
  name: string;
  path: string;
  publicUrl: string;
  size: number | null;
  updatedAt: string | null;
  /** Text content for `.env` / `*.json`; `null` for binaries. */
  content: string | null;
}

export interface BusinessHourBreak {
  start_time: string;
  end_time: string;
}

/** One weekly row from `business_hours` for a manager. */
export interface BusinessHourRow {
  id: string;
  user_id: string | null;
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean | null;
  slot_duration_minutes: number | null;
  breaks: BusinessHourBreak[] | null;
  break_start_time: string | null;
  break_end_time: string | null;
}

export interface BusinessDetails {
  profile: Record<string, unknown> | null;
  users: BusinessUserRow[];
  services: BusinessServiceRow[];
  hours: BusinessHourRow[];
  brandingFiles: BrandingFile[];
  brandingFolder: string | null;
}

export interface PulseemEditorState {
  userId: string;
  fromNumber: string;
  hasPassword: boolean;
  hasApiKey: boolean;
  displayName: string | null;
  brandingClientName: string | null;
}

export interface CreateBusinessResult {
  businessId: string;
  clientName: string;
  pulseemCreated: boolean;
  pulseemError?: string;
  pulseemLoginUserName?: string;
  pulseemDirectSmsCredits?: number;
  uploadedFiles: string[];
  uploadWarnings: string[];
}

export interface DeleteBusinessResult {
  success: boolean;
  pulseem?: {
    skipped?: boolean;
    deleted?: boolean;
    reason?: string;
    error?: string;
  };
  deletedRows: Record<string, number>;
  tableErrors: Record<string, string>;
  deletedStorageFiles: number;
  brandingFolder: string | null;
  brandingFolderDeleted: boolean;
}

/** Locale keys used by the salon app help center. */
export type HelpLocale = 'he' | 'en' | 'ar' | 'ru';

export type HelpI18n = Partial<Record<HelpLocale, string>>;

export type HelpAudience = 'admin' | 'client' | 'all';

export interface HelpVideo {
  id: string;
  category_id: string;
  slug: string | null;
  title: string;
  title_i18n: HelpI18n;
  description: string | null;
  description_i18n: HelpI18n;
  video_url: string;
  storage_path: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  sort_order: number;
  is_published: boolean;
}

export interface HelpCategory {
  id: string;
  slug: string;
  title: string;
  title_i18n: HelpI18n;
  description: string | null;
  description_i18n: HelpI18n;
  icon: string | null;
  sort_order: number;
  is_published: boolean;
  audience: HelpAudience;
  videos: HelpVideo[];
}
