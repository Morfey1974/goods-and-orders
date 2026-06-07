using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

/// <summary>Allocates purchase receipt landed costs to stock line unit costs in ILS.</summary>
public static class LandedCostAllocation
{
    public static decimal RoundIls(decimal value) =>
        Math.Round(value, 2, MidpointRounding.AwayFromZero);

    public static decimal ResolveAmountIls(decimal amount, string currency, decimal usdIlsRate)
    {
        var c = currency.Trim().ToUpperInvariant();
        if (c is "ILS" or "NIS" or "₪")
            return RoundIls(amount);
        if (c == "USD")
            return RoundIls(amount * usdIlsRate);
        throw new InvalidOperationException($"Unsupported landed cost currency: {currency}");
    }

    /// <summary>
    /// Returns final unitCostIls per stock line id after proportional landed cost allocation.
    /// </summary>
    public static Dictionary<Guid, decimal> ComputeFinalUnitCostsIls(
        IReadOnlyList<PurchaseReceiptLine> stockLines,
        decimal totalLandedIls)
    {
        var result = new Dictionary<Guid, decimal>();
        if (stockLines.Count == 0)
            return result;

        var bases = stockLines.ToDictionary(
            l => l.Id,
            l =>
            {
                var qty = StockQuantity.Normalize(l.Quantity);
                var unit = l.UnitCostIls ?? 0m;
                return RoundIls(unit * qty);
            });

        var totalBase = bases.Values.Sum();
        var totalQty = stockLines.Sum(l => StockQuantity.Normalize(l.Quantity));

        foreach (var line in stockLines)
        {
            var qty = StockQuantity.Normalize(line.Quantity);
            if (qty <= 0)
                continue;

            var baseIls = bases[line.Id];
            decimal share;
            if (totalLandedIls <= 0)
                share = 0;
            else if (totalBase > 0)
                share = RoundIls(totalLandedIls * (baseIls / totalBase));
            else
                share = RoundIls(totalLandedIls * (qty / totalQty));

            var finalUnit = RoundIls((baseIls + share) / qty);
            result[line.Id] = finalUnit;
        }

        return result;
    }
}
