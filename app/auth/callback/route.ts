import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const type = requestUrl.searchParams.get("type");

  // If we explicitly passed type=recovery as a query param, redirect to reset page
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/auth/reset-password`);
  }

  // For all other cases, redirect to home — the client-side will handle
  // hash fragments (#access_token=...&type=recovery) via onAuthStateChange
  return NextResponse.redirect(origin);
}
