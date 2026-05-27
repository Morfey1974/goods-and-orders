namespace OrderManagement.Api.Services;

public static class StockQuantity
{
    public static decimal Normalize(decimal value) =>
        decimal.Round(value, 0, MidpointRounding.AwayFromZero);

    public static string Format(decimal value) =>
        Normalize(value).ToString("0", System.Globalization.CultureInfo.InvariantCulture);
}
