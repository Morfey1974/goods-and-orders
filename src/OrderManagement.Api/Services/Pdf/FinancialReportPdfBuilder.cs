using System.Globalization;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services.Pdf;

public static class FinancialReportPdfBuilder
{
    public static FinancialReportPdfModel BuildIncome(
        Tenant tenant,
        string? logoAbsolutePath,
        IncomeReportDto report)
    {
        var row = 1;
        var lines = report.Lines
            .Select(l => new IncomeReportPdfLineModel(
                row++,
                FormatDate(l.PaymentDate),
                l.DocumentNumber,
                FormatDate(l.ReceiptDate),
                l.CustomerName,
                PaymentTypeLabel(l.PaymentType),
                l.Detail ?? "—",
                FormatAmount(l.Amount, l.Currency),
                FormatMoney(l.AmountIls)))
            .ToList();

        return new FinancialReportPdfModel(
            TenantPdfLetterheadBuilder.Build(tenant, logoAbsolutePath),
            "דוח הכנסות",
            "דוח הכנסות",
            DateTime.UtcNow,
            BuildPeriodSubtitle(report.From, report.To, report.GrandTotalIls, report.ReceiptCount, "קבלות"),
            FinancialReportPdfKind.Income,
            report.GrandTotalIls,
            report.ReceiptCount,
            lines,
            []);
    }

    public static FinancialReportPdfModel BuildExpense(
        Tenant tenant,
        string? logoAbsolutePath,
        ExpenseReportDto report)
    {
        var row = 1;
        var lines = report.Lines
            .Select(l => new ExpenseReportPdfLineModel(
                row++,
                FormatDate(l.DocumentDate),
                l.ReceiptNumber,
                l.SupplierName,
                string.IsNullOrWhiteSpace(l.SupplierInvoiceNumber) ? "—" : l.SupplierInvoiceNumber!,
                FormatExpenseOriginal(l.AmountOriginal, l.Currency),
                FormatMoney(l.AmountIls)))
            .ToList();

        return new FinancialReportPdfModel(
            TenantPdfLetterheadBuilder.Build(tenant, logoAbsolutePath),
            "דוח הוצאות",
            "דוח הוצאות",
            DateTime.UtcNow,
            BuildPeriodSubtitle(report.From, report.To, report.GrandTotalIls, report.ReceiptCount, "תעודות"),
            FinancialReportPdfKind.Expense,
            report.GrandTotalIls,
            report.ReceiptCount,
            [],
            lines);
    }

    private static string BuildPeriodSubtitle(
        DateTime? from,
        DateTime? to,
        decimal grandTotal,
        int count,
        string countLabel)
    {
        var period = FormatPeriod(from, to);
        return $"תקופה: {period} | סה\"כ: {FormatMoney(grandTotal)} ₪ | {countLabel}: {count}";
    }

    private static string FormatPeriod(DateTime? from, DateTime? to)
    {
        if (from is null && to is null) return "הכל";
        if (from is null) return $"עד {FormatDate(to!.Value)}";
        if (to is null) return $"מ-{FormatDate(from.Value)}";
        return $"{FormatDate(from.Value)} – {FormatDate(to.Value)}";
    }

    private static string PaymentTypeLabel(string paymentType)
    {
        if (!Enum.TryParse<ReceiptPaymentType>(paymentType, true, out var type))
            return paymentType;
        return ReceiptPaymentPdfFormatter.TypeLabel(type);
    }

    private static string FormatExpenseOriginal(decimal? amount, string currency)
    {
        if (amount is not > 0) return "—";
        var cur = string.IsNullOrWhiteSpace(currency) ? "ILS" : currency.Trim().ToUpperInvariant();
        if (cur is "ILS" or "NIS") return $"{FormatMoney(amount.Value)} ₪";
        return $"{FormatMoney(amount.Value)} {cur}";
    }

    private static string FormatAmount(decimal amount, string currency)
    {
        var cur = string.IsNullOrWhiteSpace(currency) ? "ILS" : currency.Trim().ToUpperInvariant();
        if (cur is "ILS" or "NIS") return $"{FormatMoney(amount)} ₪";
        return $"{FormatMoney(amount)} {cur}";
    }

    private static string FormatDate(DateTime utc) =>
        utc.ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    private static string FormatMoney(decimal value) =>
        value.ToString("N2", CultureInfo.InvariantCulture);
}
