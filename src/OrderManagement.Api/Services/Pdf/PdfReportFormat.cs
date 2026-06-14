using System.Globalization;

namespace OrderManagement.Api.Services.Pdf;

/// <summary>LTR-isolated amounts, dates and Latin tokens for mixed Hebrew PDF subtitles.</summary>
public static class PdfReportFormat
{
    public const char Lri = '\u2066';
    public const char Pdi = '\u2069';

    public static string Ltr(string value) =>
        string.IsNullOrEmpty(value) ? value : $"{Lri}{value}{Pdi}";

    public static string Ils(decimal value) =>
        $"{Lri}{value.ToString("N2", CultureInfo.InvariantCulture)} ₪{Pdi}";

    public static string IlsFromFormatted(string formattedAmount) =>
        $"{Lri}{formattedAmount} ₪{Pdi}";

    public static string Period(DateTime? from, DateTime? to, Func<DateTime, string> formatDate)
    {
        if (from is null && to is null) return Ltr("הכל");
        if (from is null) return Ltr($"עד {formatDate(to!.Value)}");
        if (to is null) return Ltr($"מ-{formatDate(from.Value)}");
        return Ltr($"{formatDate(from.Value)} – {formatDate(to.Value)}");
    }

    public static string PeriodSubtitle(DateTime? from, DateTime? to, Func<DateTime, string> formatDate) =>
        $"תקופה: {Period(from, to, formatDate)}";

    public static string CountSegment(string label, int count) =>
        $"{label}: {Ltr(count.ToString(CultureInfo.InvariantCulture))}";
}
