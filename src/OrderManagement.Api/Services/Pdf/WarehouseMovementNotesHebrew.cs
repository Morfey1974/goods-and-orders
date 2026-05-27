using System.Text.RegularExpressions;

namespace OrderManagement.Api.Services.Pdf;

/// <summary>Maps system-generated English movement notes to Hebrew for PDF reports.</summary>
public static class WarehouseMovementNotesHebrew
{
    private static readonly Dictionary<string, string> Exact = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Quick edit from catalog"] = "עריכה מהירה מקטלוג",
        ["Import from legacy system"] = "ייבוא ממערכת קודמת",
        ["Charge invoice (H-)"] = "חשבון חיוב (H-)",
    };

    private static readonly Regex BomSuffix = new(
        @"\s*\(BOM\s+([^)]+)\)\s*$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static string? Translate(string? notes)
    {
        if (string.IsNullOrWhiteSpace(notes)) return null;

        var text = notes.Trim();
        if (Exact.TryGetValue(text, out var exact))
            return exact;

        var bom = BomSuffix.Match(text);
        if (bom.Success)
        {
            var prefix = text[..bom.Index].Trim();
            var article = bom.Groups[1].Value.Trim();
            var prefixHe = Exact.TryGetValue(prefix, out var p) ? p : prefix;
            return $"{prefixHe} (עץ מוצר {article})";
        }

        if (text.StartsWith("Charge invoice (H-)", StringComparison.OrdinalIgnoreCase))
            return "חשבון חיוב (H-)" + text["Charge invoice (H-)".Length..];

        return text;
    }
}
