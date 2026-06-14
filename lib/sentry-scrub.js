/**
 * Shared Sentry beforeSend scrubber.
 *
 * Strips anything that could leak credentials or PII:
 *   - Authorization / Cookie request headers
 *   - password / token / accessToken / refreshToken in any JSON body
 *   - user.email (we keep user.id which is the Supabase UUID and is
 *     opaque/non-PII; everything else is removed)
 *
 * This is the LAST line of defense. Application code should still avoid
 * attaching raw tokens to Sentry context.
 */

const SENSITIVE_BODY_KEYS = [
  'password', 'pass', 'pwd',
  'token', 'accessToken', 'refreshToken',
  'apiKey', 'api_key', 'authorization',
  'jwt', 'secret', 'client_secret',
];

function scrubObjectInPlace(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 3) return;
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_BODY_KEYS.includes(key.toLowerCase())) {
      obj[key] = '[Filtered]';
    } else if (typeof obj[key] === 'object') {
      scrubObjectInPlace(obj[key], depth + 1);
    }
  }
}

export function scrubSensitiveData(event) {
  try {
    if (event?.request?.headers) {
      const h = event.request.headers;
      if (h.authorization || h.Authorization) {
        h.authorization = '[Filtered]';
        delete h.Authorization;
      }
      if (h.cookie || h.Cookie) {
        h.cookie = '[Filtered]';
        delete h.Cookie;
      }
      if (h['x-supabase-auth']) h['x-supabase-auth'] = '[Filtered]';
    }
    if (event?.request?.data) {
      if (typeof event.request.data === 'string') {
        // Don't try to parse arbitrary strings; drop if it looks like
        // a JWT or password URL-encoded payload.
        if (/password=|token=|authorization=/i.test(event.request.data)) {
          event.request.data = '[Filtered]';
        }
      } else {
        scrubObjectInPlace(event.request.data);
      }
    }
    if (event?.user) {
      if (event.user.email)    event.user.email = '[Redacted]';
      if (event.user.username) event.user.username = '[Redacted]';
      if (event.user.ip_address) event.user.ip_address = '[Redacted]';
    }
    if (event?.extra) scrubObjectInPlace(event.extra);
    if (event?.contexts) scrubObjectInPlace(event.contexts);
  } catch (e) {
    // Never throw inside beforeSend.
  }
  return event;
}
