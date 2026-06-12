using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

public class CogsReportService(
    AppDbContext db,
    InventoryValuationService valuation,
    ExchangeRateService exchangeRates,
    StockFulfillmentService stockFulfillment)
{
    public async Task<CogsReportDto> BuildAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        await stockFulfillment.ReconcileInvalidChargeStockAsync(tenantId, ct);

        var startUtc = ReportDateRange.StartUtc(from);
        var endExclusiveUtc = ReportDateRange.EndExclusiveUtc(to);
        var endInclusive = endExclusiveUtc?.AddDays(-1) ?? DateTime.UtcNow.Date;

        var openingDate = startUtc?.AddDays(-1) ?? endInclusive;
        var closingDate = endInclusive;

        var opening = await SumInventoryValueAsync(tenantId, openingDate, ct);
        var closing = await SumInventoryValueAsync(tenantId, closingDate, ct);
        var purchases = await SumReceiptMovementsAsync(tenantId, startUtc, endExclusiveUtc, ct);

        var finalizedChargeNumbers = await db.BusinessDocuments
            .AsNoTracking()
            .Where(d =>
                d.TenantId == tenantId
                && d.DocumentType == DocumentType.ChargeInvoice
                && d.Status != DocumentStatus.Draft
                && d.Status != DocumentStatus.Cancelled)
            .Select(d => d.DocumentNumber)
            .ToListAsync(ct);

        var issueQuery =
            from m in db.StockMovements.AsNoTracking()
            join p in db.Products.AsNoTracking() on m.ProductId equals p.Id
            where m.TenantId == tenantId && m.MovementType == StockMovementType.Issue
            select new { m, p };

        if (startUtc.HasValue)
            issueQuery = issueQuery.Where(x => x.m.MovementDate >= startUtc.Value);
        if (endExclusiveUtc.HasValue)
            issueQuery = issueQuery.Where(x => x.m.MovementDate < endExclusiveUtc.Value);

        var issues = await issueQuery
            .OrderBy(x => x.m.MovementDate)
            .ThenBy(x => x.p.ArticleCode)
            .ToListAsync(ct);

        issues = issues
            .Where(x => ChargeStockReference.NotesMatchFinalizedCharge(x.m.Notes, finalizedChargeNumbers))
            .ToList();

        var issueLines = issues.Select(x => new CogsIssueLineDto(
            x.m.Id,
            x.m.MovementDate,
            x.p.ArticleCode,
            x.p.Name,
            x.m.Quantity,
            x.m.TotalCost ?? 0m,
            x.m.Notes)).ToList();

        var cogsFromIssues = Math.Round(issueLines.Sum(l => l.TotalCostIls), 2);
        var cogsByFormula = Math.Round(opening + purchases - closing, 2);

        return new CogsReportDto(
            from?.Date,
            to?.Date,
            opening,
            purchases,
            closing,
            cogsByFormula,
            cogsFromIssues,
            issueLines);
    }

    /// <summary>
    /// COGS for cash-basis gross profit: stock issue cost of charge invoices
    /// linked to receipt payments in the period (prorated for partial payment).
    /// </summary>
    public async Task<decimal> SumCashBasisCogsIlsAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        var startUtc = ReportDateRange.StartUtc(from);
        var endExclusiveUtc = ReportDateRange.EndExclusiveUtc(to);

        var receipts = await db.BusinessDocuments
            .AsNoTracking()
            .Where(d =>
                d.TenantId == tenantId
                && d.DocumentType == DocumentType.Receipt
                && d.Status == DocumentStatus.Closed
                && d.ParentDocumentId != null)
            .Include(d => d.PaymentLines)
            .ToListAsync(ct);

        var chargePaymentInPeriod = new Dictionary<Guid, decimal>();

        foreach (var receipt in receipts)
        {
            var chargeId = receipt.ParentDocumentId!.Value;

            foreach (var pl in receipt.PaymentLines)
            {
                if (pl.PaymentType == ReceiptPaymentType.WithholdingTax)
                    continue;

                var paymentDate = pl.LineDate ?? receipt.IssueDate;
                if (startUtc.HasValue && paymentDate < startUtc.Value)
                    continue;
                if (endExclusiveUtc.HasValue && paymentDate >= endExclusiveUtc.Value)
                    continue;

                var currency = string.IsNullOrWhiteSpace(pl.Currency) ? "ILS" : pl.Currency.Trim().ToUpperInvariant();
                var amountIls = await ResolveAmountIlsAsync(pl.Amount, currency, paymentDate, ct);
                chargePaymentInPeriod[chargeId] = chargePaymentInPeriod.GetValueOrDefault(chargeId) + amountIls;
            }
        }

        if (chargePaymentInPeriod.Count == 0)
            return 0m;

        var chargeIds = chargePaymentInPeriod.Keys.ToList();
        var charges = await db.BusinessDocuments
            .AsNoTracking()
            .Where(d => d.TenantId == tenantId && chargeIds.Contains(d.Id))
            .Select(d => new { d.Id, d.DocumentNumber, d.TotalAmount })
            .ToListAsync(ct);

        decimal totalCogs = 0m;
        foreach (var charge in charges)
        {
            if (charge.TotalAmount <= 0)
                continue;

            var paidInPeriod = chargePaymentInPeriod[charge.Id];
            var issueCost = await SumStockIssueCostForChargeAsync(tenantId, charge.DocumentNumber, ct);
            if (issueCost <= 0)
                continue;

            var ratio = Math.Min(1m, paidInPeriod / charge.TotalAmount);
            totalCogs += issueCost * ratio;
        }

        return Math.Round(totalCogs, 2);
    }

    private async Task<decimal> SumStockIssueCostForChargeAsync(
        Guid tenantId,
        string documentNumber,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(documentNumber))
            return 0m;

        var sum = await ChargeStockReference
            .WhereChargeReference(
                db.StockMovements.AsNoTracking().Where(m =>
                    m.TenantId == tenantId && m.MovementType == StockMovementType.Issue),
                documentNumber)
            .SumAsync(m => m.TotalCost ?? 0m, ct);

        return Math.Round(sum, 2);
    }

    private async Task<decimal> ResolveAmountIlsAsync(
        decimal amount,
        string currency,
        DateTime paymentDate,
        CancellationToken ct)
    {
        if (currency is "ILS" or "NIS")
            return Math.Round(amount, 2);

        if (currency is "USD")
        {
            try
            {
                var rate = await exchangeRates.GetUsdIlsAsync(paymentDate, ct);
                return Math.Round(amount * rate.Rate, 2);
            }
            catch (InvalidOperationException)
            {
                return Math.Round(amount, 2);
            }
        }

        return Math.Round(amount, 2);
    }

    private async Task<decimal> SumInventoryValueAsync(Guid tenantId, DateTime asOf, CancellationToken ct)
    {
        var lots = await valuation.ListLotsAsync(tenantId, asOf, null, null, ct);
        return Math.Round(lots.Sum(l => l.TotalValueIls), 2);
    }

    private async Task<decimal> SumReceiptMovementsAsync(
        Guid tenantId,
        DateTime? startUtc,
        DateTime? endExclusiveUtc,
        CancellationToken ct)
    {
        var q = db.StockMovements.AsNoTracking()
            .Where(m => m.TenantId == tenantId && m.MovementType == StockMovementType.Receipt);
        if (startUtc.HasValue)
            q = q.Where(m => m.MovementDate >= startUtc.Value);
        if (endExclusiveUtc.HasValue)
            q = q.Where(m => m.MovementDate < endExclusiveUtc.Value);

        var sum = await q.SumAsync(m => m.TotalCost ?? 0m, ct);
        return Math.Round(sum, 2);
    }
}
