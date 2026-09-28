import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, CLIENT_COOKIE, verifyToken } from "@/lib/token";

/**
 * First line of defence: sends visitors without a valid session cookie to the sign-in page.
 * Real authorization still happens on the server in every page and API route.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return NextResponse.next();
    const adminId = await verifyToken(request.cookies.get(ADMIN_COOKIE)?.value, "admin");
    if (!adminId) return NextResponse.redirect(new URL("/admin/login", request.url));
    return NextResponse.next();
  }

  const clientId = await verifyToken(request.cookies.get(CLIENT_COOKIE)?.value, "client");
  if (!clientId) return NextResponse.redirect(new URL("/?expired=1", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/upload/:path*", "/submissions/:path*", "/admin/:path*"],
};
