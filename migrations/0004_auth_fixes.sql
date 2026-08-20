-- Normalize sessions created by the first account release to SQLite's timestamp format.
UPDATE sessions
SET expires_at = replace(substr(expires_at, 1, 19), 'T', ' ')
WHERE instr(expires_at, 'T') > 0;

-- Remove the overly broad IP-only limits from the first account release.
DELETE FROM auth_rate_limits;
