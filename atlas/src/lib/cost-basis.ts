/**
 * A single holding tracked at weighted-average cost (PRU) — the one place the
 * buy/sell cost-basis math lives. repo.getPositions, repo.totalRealizedPnl and
 * tax.computeStockRealized all reduce transactions through this, so the rule
 * (fees into the basis on a buy, out of the proceeds on a sell; proportional
 * basis reduction on a partial sell) is defined — and can be fixed — only once.
 */

const EPS = 1e-9;

export interface SaleResult {
  /** Quantity actually sold (capped at what is held). */
  sellQty: number;
  /** Average cost per unit just before the sale. */
  pru: number;
  /** Proceeds net of fees: sellQty × price − fees. */
  proceeds: number;
  /** Cost basis released by the sale: pru × sellQty. */
  costBasis: number;
  /** Realized P&L: proceeds − costBasis. */
  realized: number;
}

export class Lot {
  quantity = 0;
  /** Total remaining cost basis (acquisition cost, fees included). */
  cost = 0;

  buy(quantity: number, price: number, fees = 0): void {
    this.quantity += quantity;
    this.cost += quantity * price + fees;
  }

  /** Apply a sale (capped at holdings). Returns null when nothing is held. */
  sell(quantity: number, price: number, fees = 0): SaleResult | null {
    const qtyBefore = this.quantity;
    if (qtyBefore <= EPS) return null;
    const sellQty = Math.min(quantity, qtyBefore);
    const pru = this.cost / qtyBefore;
    const proceeds = sellQty * price - fees;
    const costBasis = pru * sellQty;
    this.quantity = qtyBefore - sellQty;
    this.cost *= Math.max(0, qtyBefore - sellQty) / qtyBefore;
    return { sellQty, pru, proceeds, costBasis, realized: proceeds - costBasis };
  }

  get avgCost(): number {
    return this.quantity > 0 ? this.cost / this.quantity : 0;
  }
}
