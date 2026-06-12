import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { deleteAlert, setAlertActive } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId)) return bad("id invalide");
    const body = (await req.json()) as { active?: boolean };
    if (typeof body.active !== "boolean") return bad("champ active requis");
    setAlertActive(numId, body.active);
    return ok({ updated: true });
  } catch (e) {
    return oops(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId)) return bad("id invalide");
    deleteAlert(numId);
    return ok({ deleted: true });
  } catch (e) {
    return oops(e);
  }
}
