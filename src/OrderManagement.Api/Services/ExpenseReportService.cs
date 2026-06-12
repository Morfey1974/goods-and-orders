using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

public class ExpenseReportService(AppDbContext db)
{
    public async Task<ExpenseReportDto> BuildAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        var startUtc = ReportDateRange.StartUtc(from);
        var endExclusiveUtc = ReportDateRange.EndExclusiveUtc(to);

        var receipts = await db.PurchaseReceipts
            .AsNoTracking()
            .Where(r => r.TenantId == tenantId && r.Status == PurchaseReceiptStatus.Posted)
            .Include(r => r.Supplier)
            .Include(r => r.Lines)
            .ThenInclude(l => l.Product)
            .Include(r => r.LandedCostLines)
            .ToListAsync(ct);

        var lines = new List<ExpenseReportLineDto>();

        foreach (var receipt in receipts.OrderBy(r => r.DocumentDate).ThenBy(r => r.ReceiptNumber))
        {
            if (startUtc.HasValue && receipt.DocumentDate < startUtc.Value)
                continue;
            if (endExclusiveUtc.HasValue && receipt.DocumentDate >= endExclusiveUtc.Value)
                continue;

            var ils = ComputeStockPurchaseAmountIls(receipt);
            if (ils <= 0) continue;

            var currency = NormalizeCurrency(receipt.Currency);
            var stockLineCount = receipt.Lines.Count(l =>
                l.Product != null && ProductInventoryHelper.TracksStock(l.Product));

            lines.Add(new ExpenseReportLineDto(
                receipt.Id,
                receipt.ReceiptNumber,
                receipt.DocumentDate,
                receipt.Supplier.Name,
                receipt.SupplierInvoiceNumber?.Trim(),
                currency,
                null,
                ils,
                stockLineCount));
        }

        var grandTotal = Math.Round(lines.Sum(l => l.AmountIls), 2);
        return new ExpenseReportDto(from?.Date, to?.Date, lines, grandTotal, lines.Count);
    }

    /// <summary>Inventory purchases only — excludes fixed assets and consumables expensed separately.</summary>
    internal static decimal ComputeStockPurchaseAmountIls(PurchaseReceipt receipt)
    {
        var stockLines = receipt.Lines
            .Where(l => l.Product != null && ProductInventoryHelper.TracksStock(l.Product))
            .ToList();
        if (stockLines.Count == 0) return 0m;

        var stockBase = stockLines.Sum(l => PurchaseReceiptFixedAssetPosting.ResolveLineTotalIls(receipt, l));
        if (!receipt.ApplyLandedCosts || receipt.LandedCostLines.Count == 0)
            return DepreciationCalculator.RoundMoney(stockBase);

        var totalLandedIls = receipt.LandedCostLines.Sum(l => l.AmountIls ?? 0m);
        if (totalLandedIls <= 0) return DepreciationCalculator.RoundMoney(stockBase);

        var faLines = receipt.Lines
            .Where(l => l.Product != null && ProductTypePrefixes.IsFixedAsset(l.Product.ProductType))
            .ToList();
        var faBase = faLines.Sum(l => PurchaseReceiptFixedAssetPosting.ResolveLineTotalIls(receipt, l));
        var allocBase = stockBase + faBase;
        if (allocBase <= 0) return DepreciationCalculator.RoundMoney(stockBase);

        var stockLanded = faBase <= 0
            ? totalLandedIls
            : DepreciationCalculator.RoundMoney(totalLandedIls * (stockBase / allocBase));

        return DepreciationCalculator.RoundMoney(stockBase + stockLanded);
    }

    private static string NormalizeCurrency(string? currency)
    {
        var c = string.IsNullOrWhiteSpace(currency) ? "ILS" : currency.Trim().ToUpperInvariant();
        return c is "NIS" or "₪" ? "ILS" : c.Length > 3 ? c[..3] : c;
    }
}
