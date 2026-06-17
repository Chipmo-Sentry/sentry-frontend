/** Canonical Mongolian labels for AI alert taxonomy.
 *
 * SINGLE SOURCE OF TRUTH — keep these values in lockstep with the Telegram bot
 * and superadmin so a category/level/verdict reads identically everywhere.
 * Do not redefine these maps in page/component files; import from here. */

import type { BillingStatus, JournalKind } from "./api";
import type { AlertCategory, AlertLevel, FeedbackVerdict } from "./types";

/** AI зөрчлийн ангилал (category). */
export const CATEGORY_LABEL: Record<AlertCategory, string> = {
  browsing: "Хайж байгаа",
  cart_pickup: "Сагсанд авсан",
  pocket_conceal: "Халаасанд хийсэн",
  bag_conceal: "Цүнхэнд хийсэн",
  other: "Бусад",
};

/** Сэрэмжлүүлгийн түвшин (level). */
export const LEVEL_LABEL: Record<AlertLevel, string> = {
  ignore: "Үл хамаа",
  log: "Бүртгэсэн",
  notify: "Анхаар",
  review: "Шалга",
};

/** Хүний дүгнэлт (feedback verdict). */
export const VERDICT_LABEL: Record<FeedbackVerdict, string> = {
  true_positive: "Зөв илрүүлэлт",
  false_positive: "Худал сэрэлт",
  unclear: "Тодорхойгүй",
};

/** Хэтэвчний төлөв (billing status). */
export const BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  active: "Идэвхтэй",
  credit: "Түр нээлттэй",
  suspended: "Хаалттай",
};

/** Гүйлгээний төрөл (journal kind). */
export const JOURNAL_KIND_LABEL: Record<JournalKind, string> = {
  topup: "Цэнэглэлт",
  usage_charge: "Хэрэглээ",
  promo_credit: "Промо",
  adjustment: "Залруулга",
};

/** Багцын нэр (tier). Backend нь чөлөөт string өгдөг тул unknown-д fallback. */
export const TIER_LABEL: Record<string, string> = {
  starter: "Стартер",
  pro: "Про",
  enterprise: "Энтерпрайз",
};
