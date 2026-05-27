namespace OrderManagement.Api.Helpers;

public static class ReportDateRange
{
    public static DateTime? StartUtc(DateTime? date) =>
        date.HasValue ? DateTime.SpecifyKind(date.Value.Date, DateTimeKind.Utc) : null;

    public static DateTime? EndExclusiveUtc(DateTime? date) =>
        date.HasValue ? DateTime.SpecifyKind(date.Value.Date.AddDays(1), DateTimeKind.Utc) : null;

    public static string? Validate(DateTime? from, DateTime? to)
    {
        if (from.HasValue && to.HasValue && from.Value.Date > to.Value.Date)
            return "From date must be before or equal to to date.";

        return null;
    }
}
