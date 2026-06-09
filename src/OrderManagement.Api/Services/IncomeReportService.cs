using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

public class IncomeReportService(AppDbContext db, ExchangeRateService exchangeRates)
{
    public async Task<IncomeReportDto> BuildAsync(
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
                && d.Status == DocumentStatus.Closed)
            .Include(d => d.Customer)
            .Include(d => d.PaymentLines)
            .ToListAsync(ct);

        var lines = new List<IncomeReportLineDto>();

        foreach (var receipt in receipts.OrderBy(d => d.IssueDate).ThenBy(d => d.DocumentNumber))
        {
            var customerName = receipt.Customer.DocumentName ?? receipt.Customer.Name;

            foreach (var pl in receipt.PaymentLines.OrderBy(p => p.SortOrder))
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

                lines.Add(new IncomeReportLineDto(
                    receipt.Id,
                    receipt.DocumentNumber,
                    receipt.IssueDate,
                    customerName,
                    paymentDate,
                    pl.PaymentType.ToString(),
                    currency,
                    Math.Round(pl.Amount, 2),
                    amountIls,
                    pl.GeneralDetail?.Trim()));
            }
        }

        lines = lines
            .OrderBy(l => l.PaymentDate)
            .ThenBy(l => l.DocumentNumber)
            .ThenBy(l => l.PaymentType)
            .ToList();

        var grandTotal = Math.Round(lines.Sum(l => l.AmountIls), 2);
        var receiptCount = lines.Select(l => l.ReceiptId).Distinct().Count();

        return new IncomeReportDto(from?.Date, to?.Date, lines, grandTotal, receiptCount);
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
}
