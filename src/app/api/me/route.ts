import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth/session";

export const dynamic = "force-dynamic";

/** Current authenticated user (server-derived; never trusts client id). */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}
