import { runScheduledAlertCheck } from "@/lib/alert-engine";
import { ok, oops } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Background alert check, hit by the macOS launchd agent on a schedule.
 * Refreshes quotes for every active alert and notifies via the configured
 * channels (Discord / Telegram / email) even when no browser is open.
 */
export async function GET() {
  try {
    const result = await runScheduledAlertCheck();
    return ok({
      ranAt: new Date().toISOString(),
      checked: result.checked,
      triggered: result.triggered.length,
      tickers: result.triggered.map((tr) => tr.ticker),
      errors: result.errors,
    });
  } catch (e) {
    return oops(e);
  }
}
