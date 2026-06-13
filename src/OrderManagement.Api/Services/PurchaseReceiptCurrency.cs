namespace OrderManagement.Api.Services;

public static class PurchaseReceiptCurrency
{
    public static string Normalize(string? currency)
    {
        var c = string.IsNullOrWhiteSpace(currency) ? "ILS" : currency.Trim().ToUpperInvariant();
        return c is "NIS" or "₪" ? "ILS" : c.Length > 3 ? c[..3] : c;
    }

    public static bool IsIls(string? currency) => Normalize(currency) is "ILS";

    public static bool IsUsd(string? currency) => Normalize(currency) == "USD";
}
