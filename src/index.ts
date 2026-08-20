import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

interface ClassItem {
  id: string;
  day: number;
  week?: "A" | "B" | "ALL";
  name: string;
  room: string;
  start: string;
  end: string;
}

interface ScheduleData {
  format: "next-class-timetable";
  version: 1;
  cycle: "weekly" | "biweekly";
  anchorDate: string;
  classes: ClassItem[];
}

interface DeviceRow {
  id: string;
  schedule_json: string;
  reminder_minutes: number;
  subscription_json: string | null;
}

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

function validDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

function validSchedule(value: unknown): value is ClassItem[] {
  return Array.isArray(value) && value.length <= 80 && value.every((item) =>
    item && typeof item.id === "string" && item.id.length <= 80 &&
    Number.isInteger(item.day) && item.day >= 1 && item.day <= 5 &&
    (item.week === undefined || ["A", "B", "ALL"].includes(item.week)) &&
    typeof item.name === "string" && item.name.trim().length > 0 && item.name.length <= 60 &&
    typeof item.room === "string" && item.room.length <= 60 &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(item.start) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(item.end)
  );
}

const validDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function normalizeSchedule(value: unknown): ScheduleData {
  if (Array.isArray(value)) {
    return {
      format: "next-class-timetable", version: 1, cycle: "weekly",
      anchorDate: "2026-01-05", classes: value.map((item) => ({ ...item, week: "ALL" })),
    };
  }
  const data = value as Partial<ScheduleData> | null;
  return {
    format: "next-class-timetable",
    version: 1,
    cycle: data?.cycle === "biweekly" ? "biweekly" : "weekly",
    anchorDate: validDate(data?.anchorDate) ? data.anchorDate : "2026-01-05",
    classes: validSchedule(data?.classes) ? data.classes : [],
  };
}

async function sendPush(env: Env, subscription: PushSubscription, title: string, body: string) {
  const payload = await buildPushPayload(
    {
      data: JSON.stringify({ title, body, tag: `next-class-${Date.now()}`, url: "/" }),
      options: { ttl: 300, urgency: "high" },
    },
    subscription,
    {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
  );
  return fetch(subscription.endpoint, payload);
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/config" && request.method === "GET") {
    return json({ vapidPublicKey: env.VAPID_PUBLIC_KEY });
  }

  if (url.pathname.startsWith("/api/device/") && request.method === "GET") {
    const id = decodeURIComponent(url.pathname.slice("/api/device/".length));
    if (!validDeviceId(id)) return json({ error: "잘못된 기기 ID입니다." }, 400);
    const row = await env.DB.prepare(
      "SELECT schedule_json, reminder_minutes, subscription_json IS NOT NULL AS push_enabled FROM devices WHERE id = ?",
    ).bind(id).first<{ schedule_json: string; reminder_minutes: number; push_enabled: number }>();
    if (!row) return json({
      schedule: [], reminderMinutes: 10, pushEnabled: false,
      cycle: "weekly", anchorDate: "2026-01-05",
    });
    const saved = normalizeSchedule(JSON.parse(row.schedule_json));
    return json({
      schedule: saved.classes,
      cycle: saved.cycle,
      anchorDate: saved.anchorDate,
      reminderMinutes: row.reminder_minutes,
      pushEnabled: Boolean(row.push_enabled),
    });
  }

  if (url.pathname === "/api/device" && request.method === "PUT") {
    const body = await request.json<Record<string, unknown>>().catch(() => null);
    if (!body || !validDeviceId(body.deviceId) || !validSchedule(body.schedule)) {
      return json({ error: "저장할 시간표 형식이 올바르지 않습니다." }, 400);
    }
    const reminder = Number(body.reminderMinutes);
    if (![5, 10, 15, 30].includes(reminder)) return json({ error: "알림 시간을 확인해 주세요." }, 400);
    const cycle = body.cycle === "biweekly" ? "biweekly" : "weekly";
    if (!validDate(body.anchorDate)) return json({ error: "격주 기준 날짜를 확인해 주세요." }, 400);
    const scheduleData: ScheduleData = {
      format: "next-class-timetable", version: 1, cycle,
      anchorDate: body.anchorDate,
      classes: body.schedule.map((item) => ({ ...item, week: item.week ?? "ALL" })),
    };
    const subscription = body.subscription ? JSON.stringify(body.subscription) : null;
    await env.DB.prepare(`
      INSERT INTO devices (id, schedule_json, reminder_minutes, subscription_json, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        schedule_json = excluded.schedule_json,
        reminder_minutes = excluded.reminder_minutes,
        subscription_json = COALESCE(excluded.subscription_json, devices.subscription_json),
        updated_at = CURRENT_TIMESTAMP
    `).bind(body.deviceId, JSON.stringify(scheduleData), reminder, subscription).run();
    return json({ ok: true });
  }

  if (url.pathname === "/api/push/disable" && request.method === "POST") {
    const body = await request.json<{ deviceId?: unknown }>().catch(() => ({}));
    if (!validDeviceId(body.deviceId)) return json({ error: "잘못된 기기 ID입니다." }, 400);
    await env.DB.prepare("UPDATE devices SET subscription_json = NULL WHERE id = ?").bind(body.deviceId).run();
    return json({ ok: true });
  }

  if (url.pathname === "/api/push/test" && request.method === "POST") {
    const body = await request.json<{ deviceId?: unknown }>().catch(() => ({}));
    if (!validDeviceId(body.deviceId)) return json({ error: "잘못된 기기 ID입니다." }, 400);
    const row = await env.DB.prepare("SELECT subscription_json FROM devices WHERE id = ?")
      .bind(body.deviceId).first<{ subscription_json: string | null }>();
    if (!row?.subscription_json) return json({ error: "먼저 알림을 켜 주세요." }, 404);
    const response = await sendPush(env, JSON.parse(row.subscription_json), "알림 준비 완료", "다음 수업 알림이 정상적으로 설정됐어요.");
    if (response.status === 404 || response.status === 410) {
      await env.DB.prepare("UPDATE devices SET subscription_json = NULL WHERE id = ?").bind(body.deviceId).run();
    }
    return json({ ok: response.ok }, response.ok ? 200 : 502);
  }

  return json({ error: "Not found" }, 404);
}

function seoulNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    day: weekdayMap[get("weekday")],
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function activeCycleWeek(date: string, anchorDate: string): "A" | "B" {
  const current = Date.parse(`${date}T00:00:00Z`);
  const anchor = Date.parse(`${anchorDate}T00:00:00Z`);
  const weeks = Math.floor((current - anchor) / 604_800_000);
  return ((weeks % 2) + 2) % 2 === 0 ? "A" : "B";
}

async function runScheduled(env: Env): Promise<void> {
  const now = seoulNow();
  await env.DB.prepare("DELETE FROM sent_notifications WHERE class_date < date('now', '-14 days')").run();
  if (now.day > 5) return;

  const { results } = await env.DB.prepare(
    "SELECT id, schedule_json, reminder_minutes, subscription_json FROM devices WHERE subscription_json IS NOT NULL",
  ).all<DeviceRow>();

  for (const device of results) {
    const saved = normalizeSchedule(JSON.parse(device.schedule_json));
    const activeWeek = saved.cycle === "biweekly" ? activeCycleWeek(now.date, saved.anchorDate) : "ALL";
    for (const item of saved.classes.filter((entry) =>
      entry.day === now.day && (activeWeek === "ALL" || !entry.week || entry.week === "ALL" || entry.week === activeWeek)
    )) {
      const [hour, minute] = item.start.split(":").map(Number);
      const alertAt = hour * 60 + minute - device.reminder_minutes;
      if (now.minutes < alertAt || now.minutes >= alertAt + 5) continue;

      const inserted = await env.DB.prepare(`
        INSERT OR IGNORE INTO sent_notifications (device_id, class_id, class_date) VALUES (?, ?, ?)
      `).bind(device.id, item.id, now.date).run();
      if (!inserted.meta.changes) continue;

      try {
        const room = item.room ? ` · ${item.room}` : "";
        const response = await sendPush(
          env,
          JSON.parse(device.subscription_json!) as PushSubscription,
          `${device.reminder_minutes}분 후 ${item.name}`,
          `${item.start}${room}`,
        );
        if (response.status === 404 || response.status === 410) {
          await env.DB.prepare("UPDATE devices SET subscription_json = NULL WHERE id = ?").bind(device.id).run();
        }
        if (!response.ok) throw new Error(`Push service returned ${response.status}`);
      } catch (error) {
        console.error("push failed", device.id, error);
        await env.DB.prepare(
          "DELETE FROM sent_notifications WHERE device_id = ? AND class_id = ? AND class_date = ?",
        ).bind(device.id, item.id, now.date).run();
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api(request, env);
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env));
  },
} satisfies ExportedHandler<Env>;
