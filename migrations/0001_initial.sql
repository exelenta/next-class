CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  schedule_json TEXT NOT NULL DEFAULT '[]',
  reminder_minutes INTEGER NOT NULL DEFAULT 10,
  subscription_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sent_notifications (
  device_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  class_date TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (device_id, class_id, class_date)
);

CREATE INDEX IF NOT EXISTS idx_sent_date ON sent_notifications(class_date);
