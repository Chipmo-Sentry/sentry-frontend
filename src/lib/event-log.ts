/** Mongolian labels + tone mapping for the activity/event log. */

import type { EventSeverity, EventType } from "./types";

export const EVENT_LABEL: Record<EventType, string> = {
  user_login: "Хэрэглэгч нэвтэрлээ",
  user_logout: "Хэрэглэгч гарлаа",
  user_invited: "Хэрэглэгч уригдлаа",
  invite_accepted: "Урилга зөвшөөрөгдлөө",
  member_role_changed: "Эрх өөрчлөгдлөө",
  member_access_changed: "Хандалт өөрчлөгдлөө",
  org_created: "Байгууллага үүслээ",
  org_deleted: "Байгууллага устлаа",
  camera_registered: "Камер холбогдлоо",
  camera_updated: "Камер засагдлаа",
  camera_stream_down: "Камер тасарлаа",
  camera_stream_recovered: "Камер сэргэлээ",
  agent_paired: "Десктоп апп холбогдлоо",
  agent_online: "Десктоп апп асаалаа",
  agent_offline: "Десктоп апп унтарлаа",
  agent_heartbeat: "Десктоп апп асаалттай",
  node_paired: "AI node холбогдлоо",
  node_online: "AI node онлайн",
  node_offline: "AI node офлайн",
  node_heartbeat: "AI node асаалттай",
  alert_created: "Сэжигтэй үйлдэл",
  risk_episode: "Объектын эрсдэл",
  error: "Алдаа",
};

export type Tone = "neutral" | "success" | "warning" | "danger";

export const SEVERITY_TONE: Record<EventSeverity, Tone> = {
  info: "neutral",
  success: "success",
  warning: "warning",
  error: "danger",
  critical: "danger",
};

export const SEVERITY_LABEL: Record<EventSeverity, string> = {
  info: "Мэдээлэл",
  success: "Амжилт",
  warning: "Анхаар",
  error: "Алдаа",
  critical: "Ноцтой",
};

/** Filter groups for the UI — collapses the long EventType list into a few
 * meaningful buckets the user actually thinks in. */
export const EVENT_GROUPS: { label: string; types: EventType[] }[] = [
  { label: "Сэжиг", types: ["alert_created", "risk_episode"] },
  {
    label: "Камер",
    types: ["camera_registered", "camera_updated", "camera_stream_down", "camera_stream_recovered"],
  },
  {
    label: "Десктоп апп",
    types: ["agent_paired", "agent_online", "agent_offline"],
  },
  { label: "AI node", types: ["node_paired", "node_online", "node_offline"] },
  {
    label: "Хэрэглэгч",
    types: [
      "user_login",
      "user_logout",
      "user_invited",
      "invite_accepted",
      "member_role_changed",
      "member_access_changed",
    ],
  },
  { label: "Байгууллага", types: ["org_created", "org_deleted"] },
];
