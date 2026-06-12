using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Helpers;

public static class ChargeStockReference
{
    public static string? TryExtractChargeNumber(string? notes)
    {
        if (string.IsNullOrWhiteSpace(notes))
            return null;

        var trimmed = notes.Trim();

        var bomIdx = trimmed.IndexOf(" (BOM", StringComparison.OrdinalIgnoreCase);
        if (bomIdx > 0)
            return trimmed[..bomIdx].Trim();

        var slashIdx = trimmed.IndexOf(" /", StringComparison.Ordinal);
        if (slashIdx > 0)
            return trimmed[..slashIdx].Trim();

        if (!trimmed.Contains(' ') && !trimmed.Contains('\t'))
            return trimmed;

        return null;
    }

    public static bool NotesMatch(string? notes, string documentNumber)
    {
        if (string.IsNullOrWhiteSpace(notes) || string.IsNullOrWhiteSpace(documentNumber))
            return false;

        return notes.Equals(documentNumber, StringComparison.OrdinalIgnoreCase)
            || notes.StartsWith($"{documentNumber} (BOM", StringComparison.OrdinalIgnoreCase)
            || notes.StartsWith($"{documentNumber} /", StringComparison.OrdinalIgnoreCase);
    }

    public static bool NotesMatchFinalizedCharge(string? notes, IReadOnlyCollection<string> finalizedChargeNumbers)
    {
        var chargeNumber = TryExtractChargeNumber(notes);
        if (chargeNumber is null)
            return true;

        return finalizedChargeNumbers.Any(number =>
            number.Equals(chargeNumber, StringComparison.OrdinalIgnoreCase));
    }

    public static bool NotesMatchAnyDraftCharge(string? notes, IReadOnlyCollection<string> draftChargeNumbers)
    {
        if (string.IsNullOrWhiteSpace(notes) || draftChargeNumbers.Count == 0)
            return false;

        return draftChargeNumbers.Any(number => NotesMatch(notes, number));
    }

    public static IQueryable<StockMovement> WhereChargeReference(
        IQueryable<StockMovement> query,
        string documentNumber) =>
        query.Where(m =>
            m.Notes != null && (
                m.Notes == documentNumber
                || m.Notes.StartsWith(documentNumber + " (BOM")
                || m.Notes.StartsWith(documentNumber + " /")));
}
