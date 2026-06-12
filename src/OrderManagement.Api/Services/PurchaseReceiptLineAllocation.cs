using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

/// <summary>Classifies receipt lines and allocates landed costs across stock, FA, CM, and vendor services.</summary>
public static class PurchaseReceiptLineAllocation
{
    public static bool IsVendorService(Product product) =>
        product.ProductType is ProductType.Service or ProductType.Charge;

    public static bool ReceivesLandedCost(Product product) =>
        ProductInventoryHelper.TracksStock(product) ||
        ProductTypePrefixes.IsFixedAsset(product.ProductType) ||
        ProductTypePrefixes.IsConsumable(product.ProductType) ||
        IsVendorService(product);

    public static decimal ResolveLineBaseIls(PurchaseReceipt receipt, PurchaseReceiptLine line) =>
        PurchaseReceiptFixedAssetPosting.ResolveLineTotalIls(receipt, line);

    public static List<PurchaseReceiptLine> AllocatableLines(PurchaseReceipt receipt) =>
        receipt.Lines
            .Where(l => l.Product != null && ReceivesLandedCost(l.Product))
            .OrderBy(l => l.SortOrder)
            .ToList();

    public static Dictionary<Guid, decimal> ComputeLandedShares(
        PurchaseReceipt receipt,
        decimal totalLandedIls)
    {
        var allocatable = AllocatableLines(receipt)
            .Select(l => (l.Id, ResolveLineBaseIls(receipt, l)))
            .ToList();
        return PurchaseReceiptFixedAssetPosting.AllocateLandedCostToLines(allocatable, totalLandedIls);
    }

    public static decimal StockPurchaseAmountIls(
        PurchaseReceipt receipt,
        IReadOnlyDictionary<Guid, decimal>? landedShares = null)
    {
        var stockLines = receipt.Lines
            .Where(l => l.Product != null && ProductInventoryHelper.TracksStock(l.Product))
            .ToList();
        if (stockLines.Count == 0) return 0m;

        var shares = landedShares ?? ComputeLandedSharesFromReceipt(receipt);
        var total = stockLines.Sum(l =>
        {
            var baseIls = ResolveLineBaseIls(receipt, l);
            var landed = shares.GetValueOrDefault(l.Id);
            return DepreciationCalculator.RoundMoney(baseIls + landed);
        });
        return DepreciationCalculator.RoundMoney(total);
    }

    private static Dictionary<Guid, decimal> ComputeLandedSharesFromReceipt(PurchaseReceipt receipt)
    {
        if (!receipt.ApplyLandedCosts || receipt.LandedCostLines.Count == 0)
            return new Dictionary<Guid, decimal>();

        var totalLandedIls = receipt.LandedCostLines.Sum(l => l.AmountIls ?? 0m);
        if (totalLandedIls <= 0) return new Dictionary<Guid, decimal>();

        return ComputeLandedShares(receipt, totalLandedIls);
    }
}
