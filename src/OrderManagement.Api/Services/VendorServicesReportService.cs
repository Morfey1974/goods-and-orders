using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

public class VendorServicesReportService(AppDbContext db)
{
    public async Task<VendorServicesReportDto> BuildAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        var startUtc = ReportDateRange.StartUtc(from);
        var endExclusiveUtc = ReportDateRange.EndExclusiveUtc(to);
        var lines = new List<VendorServiceLineDto>();

        var landedRows = await db.PurchaseReceiptLandedCostLines
            .AsNoTracking()
            .Include(l => l.Supplier)
            .Include(l => l.PurchaseReceipt)
            .Where(l => l.PurchaseReceipt.TenantId == tenantId &&
                        l.PurchaseReceipt.Status == PurchaseReceiptStatus.Posted)
            .ToListAsync(ct);

        foreach (var row in landedRows)
        {
            var receipt = row.PurchaseReceipt;
            if (startUtc.HasValue && receipt.DocumentDate < startUtc.Value) continue;
            if (endExclusiveUtc.HasValue && receipt.DocumentDate >= endExclusiveUtc.Value) continue;

            var amount = row.AmountIls ?? 0m;
            if (amount <= 0) continue;

            lines.Add(new VendorServiceLineDto(
                receipt.DocumentDate,
                "LandedCost",
                receipt.ReceiptNumber,
                row.Supplier.Name,
                row.Category.ToString(),
                row.Notes,
                DepreciationCalculator.RoundMoney(amount)));
        }

        var serviceExpenses = await db.BusinessExpenses
            .AsNoTracking()
            .Where(e => e.TenantId == tenantId &&
                        !e.IsHomeMixed &&
                        e.OperatingExpenseType == OperatingExpenseType.Logistics)
            .ToListAsync(ct);

        foreach (var expense in serviceExpenses)
        {
            if (startUtc.HasValue && expense.ExpenseDate < startUtc.Value) continue;
            if (endExclusiveUtc.HasValue && expense.ExpenseDate >= endExclusiveUtc.Value) continue;

            string? receiptNumber = null;
            if (expense.PurchaseReceiptLineId is { } lineId)
            {
                receiptNumber = await db.PurchaseReceiptLines
                    .AsNoTracking()
                    .Where(l => l.Id == lineId)
                    .Join(db.PurchaseReceipts.AsNoTracking(),
                        l => l.PurchaseReceiptId,
                        r => r.Id,
                        (_, r) => r.ReceiptNumber)
                    .FirstOrDefaultAsync(ct);
            }

            lines.Add(new VendorServiceLineDto(
                expense.ExpenseDate,
                expense.PurchaseReceiptLineId is not null ? "GrService" : "Journal",
                receiptNumber,
                expense.VendorName ?? "—",
                OperatingExpenseType.Logistics.ToString(),
                expense.Description,
                expense.AmountIls));
        }

        var ordered = lines
            .OrderBy(l => l.ServiceDate)
            .ThenBy(l => l.VendorName)
            .ToList();

        var total = DepreciationCalculator.RoundMoney(ordered.Sum(l => l.AmountIls));
        return new VendorServicesReportDto(from?.Date, to?.Date, ordered, total);
    }
}
