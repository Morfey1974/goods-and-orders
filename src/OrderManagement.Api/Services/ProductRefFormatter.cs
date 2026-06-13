using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;

namespace OrderManagement.Api.Services;

public static class ProductRefFormatter
{
    public static async Task<string> ArticleCodeAsync(
        AppDbContext db,
        Guid tenantId,
        Guid productId,
        CancellationToken ct)
    {
        var row = await db.Products
            .AsNoTracking()
            .Where(p => p.Id == productId && p.TenantId == tenantId)
            .Select(p => new { p.ArticleCode, p.LegacySku, p.Name })
            .FirstOrDefaultAsync(ct);

        if (row is null)
            return productId.ToString();

        if (!string.IsNullOrWhiteSpace(row.ArticleCode))
            return row.ArticleCode.Trim();

        if (!string.IsNullOrWhiteSpace(row.LegacySku))
            return row.LegacySku.Trim();

        return row.Name;
    }
}
