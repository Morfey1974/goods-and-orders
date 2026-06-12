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

            var ils = PurchaseReceiptLineAllocation.StockPurchaseAmountIls(receipt);
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

    private static string NormalizeCurrency(string? currency)
    {
        var c = string.IsNullOrWhiteSpace(currency) ? "ILS" : currency.Trim().ToUpperInvariant();
        return c is "NIS" or "₪" ? "ILS" : c.Length > 3 ? c[..3] : c;
    }
}
