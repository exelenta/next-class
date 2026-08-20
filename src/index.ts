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

const encoder = new TextEncoder();
const SESSION_COOKIE = "next_class_session";
const SESSION_DAYS = 30;

function bytesToBase64(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function randomToken(size = 32): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(size)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value: string): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: 210_000 },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

function sessionToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function currentUser(request: Request, env: Env): Promise<{ id: string; username: string } | null> {
  const token = sessionToken(request);
  if (!token) return null;
  return env.DB.prepare(`
    SELECT users.id, users.username FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP
  `).bind(await sha256(token)).first<{ id: string; username: string }>();
}

function sqliteTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function newSession(): Promise<{ token: string; tokenHash: string; expires: Date; expiresAt: string }> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  return { token, tokenHash: await sha256(token), expires, expiresAt: sqliteTimestamp(expires) };
}

function sessionCookie(token: string, expires: Date): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expires.toUTCString()}`;
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function authJson(data: unknown, cookie: string, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "set-cookie": cookie } });
}

function validUsername(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_]{4,20}$/.test(value);
}

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function equalSecret(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function authLimit(env: Env, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT attempts, window_start FROM auth_rate_limits WHERE key = ?")
    .bind(key).first<{ attempts: number; window_start: number }>();
  return Boolean(row && now - row.window_start < windowSeconds && row.attempts >= max);
}

async function recordAuthAttempt(env: Env, key: string, windowSeconds: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`INSERT INTO auth_rate_limits (key, attempts, window_start) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN ? - window_start >= ? THEN 1 ELSE attempts + 1 END,
      window_start = CASE WHEN ? - window_start >= ? THEN ? ELSE window_start END`)
    .bind(key, now, now, windowSeconds, now, windowSeconds, now).run();
}

async function clearAuthAttempt(env: Env, key: string): Promise<void> {
  await env.DB.prepare("DELETE FROM auth_rate_limits WHERE key = ?").bind(key).run();
}

function requestClientKey(request: Request, deviceId: string): string {
  return request.headers.get("cf-connecting-ip") ?? `device:${deviceId}`;
}

function schedulesDiffer(deviceSchedule: string, accountSchedule: string): boolean {
  const device = normalizeSchedule(JSON.parse(deviceSchedule));
  const account = normalizeSchedule(JSON.parse(accountSchedule));
  if (device.classes.length === 0) return false;
  return JSON.stringify(device) !== JSON.stringify(account);
}

async function deviceAccessAllowed(env: Env, deviceId: string, userId: string | null): Promise<boolean> {
  const row = await env.DB.prepare("SELECT user_id FROM devices WHERE id = ?")
    .bind(deviceId).first<{ user_id: string | null }>();
  return !row?.user_id || row.user_id === userId;
}

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
  return fetch(subscription.endpoint, { ...payload, body: payload.body as BodyInit });
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return json({ error: "허용되지 않은 요청입니다." }, 403);
  }

  if (url.pathname === "/api/auth/me" && request.method === "GET") {
    return json({ user: await currentUser(request, env) });
  }

  if (url.pathname === "/api/auth/signup" && request.method === "POST") {
    const body = await request.json<{ username?: unknown; password?: unknown; deviceId?: unknown }>()
      .catch(() => ({} as { username?: unknown; password?: unknown; deviceId?: unknown }));
    if (!validUsername(body.username)) return json({ error: "아이디는 영문, 숫자, 밑줄 4~20자로 입력해 주세요." }, 400);
    if (!validPassword(body.password)) return json({ error: "비밀번호는 8~128자로 입력해 주세요." }, 400);
    if (!validDeviceId(body.deviceId)) return json({ error: "잘못된 기기 ID입니다." }, 400);
    const username = body.username.toLowerCase();
    const signupKey = `signup:${requestClientKey(request, body.deviceId)}:${username}`;
    if (await authLimit(env, signupKey, 5, 3600)) return json({ error: "회원가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
    if (await env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first()) {
      await recordAuthAttempt(env, signupKey, 3600);
      return json({ error: "이미 사용 중인 아이디입니다." }, 409);
    }
    const userId = crypto.randomUUID();
    const salt = randomToken(16);
    const passwordHash = await hashPassword(body.password, salt);
    const device = await env.DB.prepare("SELECT schedule_json, reminder_minutes FROM devices WHERE id = ?")
      .bind(body.deviceId).first<{ schedule_json: string; reminder_minutes: number }>();
    const session = await newSession();
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users (id, username, password_hash, password_salt) VALUES (?, ?, ?, ?)")
          .bind(userId, username, passwordHash, salt),
        env.DB.prepare("INSERT INTO timetables (user_id, schedule_json, reminder_minutes) VALUES (?, ?, ?)")
          .bind(userId, device?.schedule_json ?? JSON.stringify(normalizeSchedule([])), device?.reminder_minutes ?? 10),
        env.DB.prepare("UPDATE devices SET user_id = ? WHERE id = ?").bind(userId, body.deviceId),
        env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
          .bind(session.tokenHash, userId, session.expiresAt),
      ]);
    } catch (error) {
      console.error("signup failed", error);
      return json({ error: "회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 500);
    }
    await clearAuthAttempt(env, signupKey);
    return authJson({ user: { id: userId, username } }, sessionCookie(session.token, session.expires), 201);
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const body = await request.json<{ username?: unknown; password?: unknown; deviceId?: unknown; timetableChoice?: unknown }>()
      .catch(() => ({} as { username?: unknown; password?: unknown; deviceId?: unknown; timetableChoice?: unknown }));
    if (!validUsername(body.username) || !validPassword(body.password) || !validDeviceId(body.deviceId)) {
      return json({ error: "아이디 또는 비밀번호를 확인해 주세요." }, 400);
    }
    const normalizedUsername = body.username.toLowerCase();
    const loginKey = `login:${requestClientKey(request, body.deviceId)}:${normalizedUsername}`;
    if (await authLimit(env, loginKey, 10, 900)) return json({ error: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요." }, 429);
    const user = await env.DB.prepare("SELECT id, username, password_hash, password_salt FROM users WHERE username = ?")
      .bind(normalizedUsername).first<{ id: string; username: string; password_hash: string; password_salt: string }>();
    const candidate = user
      ? await hashPassword(body.password, user.password_salt)
      : await hashPassword(body.password, randomToken(16));
    if (!user || !equalSecret(candidate, user.password_hash)) {
      await recordAuthAttempt(env, loginKey, 900);
      return json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401);
    }
    await clearAuthAttempt(env, loginKey);
    const device = await env.DB.prepare("SELECT user_id, schedule_json, reminder_minutes FROM devices WHERE id = ?")
      .bind(body.deviceId).first<{ user_id: string | null; schedule_json: string; reminder_minutes: number }>();
    if (device?.user_id && device.user_id !== user.id) {
      return json({ error: "이 기기는 다른 계정에 연결되어 있습니다. 기존 계정에서 먼저 로그아웃해 주세요." }, 403);
    }
    const account = await env.DB.prepare("SELECT schedule_json, reminder_minutes FROM timetables WHERE user_id = ?")
      .bind(user.id).first<{ schedule_json: string; reminder_minutes: number }>();
    const conflict = device && !device.user_id && account && schedulesDiffer(device.schedule_json, account.schedule_json);
    if (conflict && !["account", "device"].includes(String(body.timetableChoice))) {
      return json({ error: "현재 기기와 계정의 시간표가 다릅니다.", conflict: true }, 409);
    }
    const session = await newSession();
    const statements: D1PreparedStatement[] = [];
    if (conflict && body.timetableChoice === "device") {
      statements.push(env.DB.prepare(`UPDATE timetables SET schedule_json = ?, reminder_minutes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?`).bind(device.schedule_json, device.reminder_minutes, user.id));
    }
    statements.push(env.DB.prepare("UPDATE devices SET user_id = ? WHERE id = ?").bind(user.id, body.deviceId));
    statements.push(env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(session.tokenHash, user.id, session.expiresAt));
    try {
      await env.DB.batch(statements);
    } catch (error) {
      console.error("login failed", error);
      return json({ error: "로그인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 500);
    }
    return authJson({ user: { id: user.id, username: user.username } }, sessionCookie(session.token, session.expires));
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const body = await request.json<{ deviceId?: unknown }>().catch(() => ({} as { deviceId?: unknown }));
    const user = await currentUser(request, env);
    const token = sessionToken(request);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    if (user && validDeviceId(body.deviceId)) {
      await env.DB.prepare(`UPDATE devices SET
          schedule_json = COALESCE((SELECT schedule_json FROM timetables WHERE user_id = ?), schedule_json),
          reminder_minutes = COALESCE((SELECT reminder_minutes FROM timetables WHERE user_id = ?), reminder_minutes),
          subscription_json = NULL, user_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?`).bind(user.id, user.id, body.deviceId, user.id).run();
    }
    return authJson({ ok: true }, clearSessionCookie());
  }

  if (url.pathname === "/api/config" && request.method === "GET") {
    return json({ vapidPublicKey: env.VAPID_PUBLIC_KEY });
  }

  if (url.pathname.startsWith("/api/device/") && request.method === "GET") {
    const id = decodeURIComponent(url.pathname.slice("/api/device/".length));
    if (!validDeviceId(id)) return json({ error: "잘못된 기기 ID입니다." }, 400);
    const user = await currentUser(request, env);
    if (!(await deviceAccessAllowed(env, id, user?.id ?? null))) {
      return json({ error: user ? "이 기기를 조회할 권한이 없습니다." : "로그인이 필요한 기기입니다." }, user ? 403 : 401);
    }
    if (user) await env.DB.prepare("UPDATE devices SET user_id = ? WHERE id = ?").bind(user.id, id).run();
    const row = user
      ? await env.DB.prepare(`SELECT timetables.schedule_json, timetables.reminder_minutes,
          EXISTS(SELECT 1 FROM devices WHERE id = ? AND subscription_json IS NOT NULL) AS push_enabled
        FROM timetables WHERE user_id = ?`).bind(id, user.id)
          .first<{ schedule_json: string; reminder_minutes: number; push_enabled: number }>()
      : await env.DB.prepare(
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
    const user = await currentUser(request, env);
    if (!(await deviceAccessAllowed(env, body.deviceId, user?.id ?? null))) {
      return json({ error: "이 기기를 변경할 권한이 없습니다." }, 403);
    }
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
    if (user) {
      await env.DB.batch([
        env.DB.prepare("UPDATE devices SET user_id = ? WHERE id = ?").bind(user.id, body.deviceId),
        env.DB.prepare(`INSERT INTO timetables (user_id, schedule_json, reminder_minutes, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET schedule_json = excluded.schedule_json,
            reminder_minutes = excluded.reminder_minutes, updated_at = CURRENT_TIMESTAMP`)
          .bind(user.id, JSON.stringify(scheduleData), reminder),
      ]);
    }
    return json({ ok: true });
  }

  if (url.pathname === "/api/push/disable" && request.method === "POST") {
    const body = await request.json<{ deviceId?: unknown }>().catch(() => ({} as { deviceId?: unknown }));
    if (!validDeviceId(body.deviceId)) return json({ error: "잘못된 기기 ID입니다." }, 400);
    const user = await currentUser(request, env);
    if (!(await deviceAccessAllowed(env, body.deviceId, user?.id ?? null))) return json({ error: "권한이 없습니다." }, 403);
    await env.DB.prepare("UPDATE devices SET subscription_json = NULL WHERE id = ?").bind(body.deviceId).run();
    return json({ ok: true });
  }

  if (url.pathname === "/api/push/test" && request.method === "POST") {
    const body = await request.json<{ deviceId?: unknown }>().catch(() => ({} as { deviceId?: unknown }));
    if (!validDeviceId(body.deviceId)) return json({ error: "잘못된 기기 ID입니다." }, 400);
    const user = await currentUser(request, env);
    if (!(await deviceAccessAllowed(env, body.deviceId, user?.id ?? null))) return json({ error: "권한이 없습니다." }, 403);
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
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();
  await env.DB.prepare("DELETE FROM auth_rate_limits WHERE window_start < unixepoch() - 86400").run();
  if (now.day > 5) return;

  const { results } = await env.DB.prepare(`SELECT devices.id,
      COALESCE(timetables.schedule_json, devices.schedule_json) AS schedule_json,
      COALESCE(timetables.reminder_minutes, devices.reminder_minutes) AS reminder_minutes,
      devices.subscription_json
    FROM devices LEFT JOIN timetables ON timetables.user_id = devices.user_id
    WHERE devices.subscription_json IS NOT NULL`).all<DeviceRow>();

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
