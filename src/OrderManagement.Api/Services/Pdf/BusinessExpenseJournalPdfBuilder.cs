using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services.Pdf;

public static class BusinessExpenseJournalPdfBuilder
{
    public static BusinessExpenseJournalPdfModel Build(
        Tenant tenant,
        string? logoPath,
        DateTime? from,
        DateTime? to,
        IReadOnlyList<BusinessExpenseDto> expenses)
    {
        var letterhead = TenantPdfLetterheadBuilder.Build(tenant, logoPath);
        var filterSubtitle = BuildFilterSubtitle(from, to);
        var lines = expenses
            .Select((e, index) => new BusinessExpenseJournalPdfLineModel(
                index + 1,
                e.ExpenseDate.ToString("dd/MM/yyyy"),
                FormatExpenseType(e),
                e.Notes ?? "—",
                e.VendorName ?? "—",
                e.AmountIls.ToString("N2"),
                e.RecognizedAmountIls.ToString("N2"),
                e.InvoiceReference ?? "—",
                e.DocumentCount > 0 ? e.DocumentCount.ToString() : "—"))
            .ToList();

        return new BusinessExpenseJournalPdfModel(
            letterhead,
            "יומן הוצאות",
            tenant.BusinessName ?? tenant.OwnerFullName ?? "—",
            DateTime.UtcNow,
            filterSubtitle,
            expenses.Sum(e => e.AmountIls),
            expenses.Sum(e => e.RecognizedAmountIls),
            lines);
    }

    private static string FormatExpenseType(BusinessExpenseDto e)
    {
        if (e.IsHomeMixed && !string.IsNullOrWhiteSpace(e.HomeExpenseType))
            return e.HomeExpenseType!;
        if (!string.IsNullOrWhiteSpace(e.OperatingExpenseType))
            return e.OperatingExpenseType!;
        return "—";
    }

    private static string BuildFilterSubtitle(DateTime? from, DateTime? to)
    {
        if (from.HasValue && to.HasValue)
            return $"תקופה: {from.Value:dd/MM/yyyy} – {to.Value:dd/MM/yyyy}";
        if (from.HasValue)
            return $"מתאריך: {from.Value:dd/MM/yyyy}";
        if (to.HasValue)
            return $"עד תאריך: {to.Value:dd/MM/yyyy}";
        return "כל התקופות";
    }
}
