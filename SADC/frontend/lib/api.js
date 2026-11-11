// Talks to the SADC backend. The Discord sign-in token is kept in this browser and sent with every request.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

const KEY = "sadc-session";

// Storage can be blocked (private windows, strict settings); then the person just signs in again next visit.
export const session = {
  get() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      if (token) localStorage.setItem(KEY, token);
      else localStorage.removeItem(KEY);
    } catch {}
  },
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Returns the JSON answer, or throws an ApiError with the backend's message, ready to show as it is.
// 401 always means the Discord sign-in expired.
export async function api(path, { method = "GET", body } = {}) {
  if (!API_URL) throw new ApiError(0, "The site isn't set up yet: NEXT_PUBLIC_API_URL is missing.");
  const token = session.get();
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the verification server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Something went wrong (${res.status}). Please try again.`);
  return data;
}

export const shortAddress = (address) => `${address.slice(0, 4)}…${address.slice(-4)}`;

export function timeAgo(iso) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!(minutes >= 1)) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
