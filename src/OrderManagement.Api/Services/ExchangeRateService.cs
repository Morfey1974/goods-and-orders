using System.Globalization;
using Microsoft.Extensions.Caching.Memory;
using OrderManagement.Api.Dto;

namespace OrderManagement.Api.Services;

/// <summary>Official USD/ILS representative rates (שער יציג) from Bank of Israel.</summary>
public class ExchangeRateService(IHttpClientFactory httpClientFactory, IMemoryCache cache)
{
    private const string SourceLabel = "Bank of Israel representative rate (שער יציג)";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromHours(12);

    public async Task<UsdIlsRateDto> GetUsdIlsAsync(DateTime requestedDate, CancellationToken ct)
    {
        var requested = DateTime.SpecifyKind(requestedDate.Date, DateTimeKind.Utc);
        if (requested > DateTime.UtcNow.Date.AddDays(1))
            throw new InvalidOperationException("Exchange rate is not available for future dates.");

        for (var offset = 0; offset <= 10; offset++)
        {
            var candidate = requested.AddDays(-offset);
            var rate = await GetCachedOrFetchAsync(candidate, ct);
            if (rate is null) continue;

            return new UsdIlsRateDto(
                rate.Value,
                candidate,
                requested,
                offset > 0,
                SourceLabel);
        }

        throw new InvalidOperationException(
            $"USD/ILS exchange rate not found for {requested:yyyy-MM-dd} or the preceding 10 days.");
    }

    private async Task<decimal?> GetCachedOrFetchAsync(DateTime date, CancellationToken ct)
    {
        var key = $"boi-usd-ils:{date:yyyy-MM-dd}";
        if (cache.TryGetValue(key, out decimal cached))
            return cached;

        var fetched = await FetchBoiUsdRateAsync(date, ct);
        if (fetched is null)
            return null;

        cache.Set(key, fetched.Value, CacheTtl);
        return fetched;
    }

    private async Task<decimal?> FetchBoiUsdRateAsync(DateTime date, CancellationToken ct)
    {
        var dateStr = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var url =
            "https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/RER_USD_ILS" +
            $"?format=csv&startperiod={dateStr}&endperiod={dateStr}";

        var client = httpClientFactory.CreateClient(nameof(ExchangeRateService));
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        using var response = await client.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            return null;

        var csv = await response.Content.ReadAsStringAsync(ct);
        foreach (var line in csv.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (!line.StartsWith("RER_USD_ILS,", StringComparison.Ordinal))
                continue;

            var parts = line.Split(',');
            if (parts.Length < 14)
                continue;

            if (!string.Equals(parts[12], dateStr, StringComparison.Ordinal))
                continue;

            if (decimal.TryParse(parts[13], NumberStyles.Number, CultureInfo.InvariantCulture, out var rate) &&
                rate > 0)
                return Math.Round(rate, 4);
        }

        return null;
    }
}
