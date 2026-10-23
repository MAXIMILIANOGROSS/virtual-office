import { NextResponse } from "next/server";
import { verifyOwner } from "@/lib/ownerServer";
export const runtime = "nodejs";
/** Dice al navegador si la sesión es la del propietario. La decisión la toma el servidor; el navegador solo la muestra. */
export async function GET(req: Request) {
  const o = await verifyOwner(req);
  return NextResponse.json({ owner: o.ok, email: o.ok ? o.email : null }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
