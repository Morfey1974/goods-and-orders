using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class ArticleSequenceService(AppDbContext db)
{
    public async Task<string> AllocateNextAsync(Guid tenantId, ProductType productType, CancellationToken ct)
    {
        var prefix = ProductTypePrefixes.GetPrefix(productType);
        return await AllocateNextAsync(tenantId, prefix, ct);
    }

    /// <summary>Reserves the next article code in the current unit of work (caller must SaveChanges).</summary>
    public async Task<string> ReserveNextArticleAsync(Guid tenantId, ProductType productType, CancellationToken ct)
    {
        var prefix = ProductTypePrefixes.GetPrefix(productType);
        return await ReserveNextArticleAsync(tenantId, prefix, ct);
    }

    public async Task<string> ReserveNextArticleAsync(Guid tenantId, string prefix, CancellationToken ct)
    {
        var seq = await db.ArticleSequences
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.Prefix == prefix, ct);

        if (seq is null)
        {
            seq = new ArticleSequence
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                Prefix = prefix,
                NextNumber = 1
            };
            db.ArticleSequences.Add(seq);
        }

        var number = seq.NextNumber;
        seq.NextNumber++;
        return $"{prefix}-{number:D5}";
    }

    public async Task<string> AllocateNextAsync(Guid tenantId, string prefix, CancellationToken ct)
    {
        var code = await ReserveNextArticleAsync(tenantId, prefix, ct);
        await db.SaveChangesAsync(ct);
        return code;
    }

    public async Task<string?> PeekNextAsync(Guid tenantId, ProductType productType, CancellationToken ct)
    {
        var prefix = ProductTypePrefixes.GetPrefix(productType);
        var seq = await db.ArticleSequences
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.Prefix == prefix, ct);
        var next = seq?.NextNumber ?? 1;
        return $"{prefix}-{next:D5}";
    }
}
