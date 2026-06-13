namespace OrderManagement.Api.Helpers;

/// <summary>Business calendar time (Israel) for folders, filenames, and user-facing timestamps.</summary>
public static class BusinessTimeZone
{
    private static readonly TimeZoneInfo Israel = ResolveIsrael();

    public static DateTime ToLocal(DateTime utc)
    {
        var normalized = utc.Kind switch
        {
            DateTimeKind.Utc => utc,
            DateTimeKind.Local => utc.ToUniversalTime(),
            _ => DateTime.SpecifyKind(utc, DateTimeKind.Utc)
        };

        return TimeZoneInfo.ConvertTimeFromUtc(normalized, Israel);
    }

    private static TimeZoneInfo ResolveIsrael()
    {
        if (TimeZoneInfo.TryFindSystemTimeZoneById("Asia/Jerusalem", out var asia))
            return asia;

        return TimeZoneInfo.FindSystemTimeZoneById("Israel Standard Time");
    }
}
