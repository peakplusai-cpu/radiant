export const ADMIN_COOKIE = "radiant_admin";
export const LINE_COOKIE = "radiant_line";
export const LINE_STATE_COOKIE = "radiant_line_state";
export const RECEIPT_COOKIE = "radiant_receipt";

export const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;

export function cookieFlags(maxAgeSeconds: number): {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  };
}

/** Clearing must repeat Secure / HttpOnly / Path or browsers keep the cookie. */
export function clearedCookie() {
  return { ...cookieFlags(0), expires: new Date(0) };
}
