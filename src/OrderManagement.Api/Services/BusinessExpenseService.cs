using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class BusinessExpenseService(AppDbContext db, TenantFileService files)
{
    public async Task<IReadOnlyList<BusinessExpenseDto>> ListAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        var tenant = await db.Tenants.AsNoTracking().FirstAsync(t => t.Id == tenantId, ct);
        var q = db.BusinessExpenses.AsNoTracking().Where(e => e.TenantId == tenantId);
        if (from.HasValue)
            q = q.Where(e => e.ExpenseDate >= DateTime.SpecifyKind(from.Value.Date, DateTimeKind.Utc));
        if (to.HasValue)
        {
            var end = DateTime.SpecifyKind(to.Value.Date, DateTimeKind.Utc);
            q = q.Where(e => e.ExpenseDate <= end);
        }

        var rows = await q
            .OrderByDescending(e => e.ExpenseDate)
            .ThenByDescending(e => e.CreatedAt)
            .Select(e => new
            {
                Expense = e,
                DocumentCount = e.Documents.Count,
            })
            .ToListAsync(ct);

        return rows
            .Select(r => BusinessExpenseMappers.ToDto(r.Expense, tenant, r.DocumentCount))
            .ToList();
    }

    public async Task<BusinessExpenseDto> GetAsync(Guid tenantId, Guid id, CancellationToken ct)
    {
        var tenant = await db.Tenants.AsNoTracking().FirstAsync(t => t.Id == tenantId, ct);
        var entity = await db.BusinessExpenses
            .AsNoTracking()
            .Include(e => e.Documents.OrderBy(d => d.SortOrder).ThenBy(d => d.CreatedAt))
            .FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Expense not found.");

        var docs = entity.Documents.Select(BusinessExpenseMappers.ToDocumentDto).ToList();
        return BusinessExpenseMappers.ToDto(entity, tenant, docs.Count, docs);
    }

    public async Task<BusinessExpenseDto> CreateAsync(
        Guid tenantId,
        CreateBusinessExpenseRequest request,
        CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstAsync(t => t.Id == tenantId, ct);
        var isHomeMixed = ResolveIsHomeMixed(request.IsHomeMixed, tenant);
        ValidateRequest(isHomeMixed, request.HomeExpenseType, request.OperatingExpenseType);
        var notes = TrimOrNull(request.Notes);
        var now = DateTime.UtcNow;
        var entity = new BusinessExpense
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ExpenseDate = DateTime.SpecifyKind(request.ExpenseDate.Date, DateTimeKind.Utc),
            IsHomeMixed = isHomeMixed,
            HomeExpenseType = isHomeMixed
                ? BusinessExpenseMappers.ParseHomeType(request.HomeExpenseType)
                : null,
            OperatingExpenseType = isHomeMixed
                ? null
                : BusinessExpenseMappers.ParseOperatingType(request.OperatingExpenseType),
            Description = notes ?? string.Empty,
            AmountIls = Math.Round(request.AmountIls, 2),
            VendorName = TrimOrNull(request.VendorName),
            InvoiceReference = TrimOrNull(request.InvoiceReference),
            Notes = notes,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.BusinessExpenses.Add(entity);
        await db.SaveChangesAsync(ct);
        return BusinessExpenseMappers.ToDto(entity, tenant, 0);
    }

    public async Task<BusinessExpenseDto> UpdateAsync(
        Guid tenantId,
        Guid id,
        UpdateBusinessExpenseRequest request,
        CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstAsync(t => t.Id == tenantId, ct);
        var isHomeMixed = ResolveIsHomeMixed(request.IsHomeMixed, tenant);
        ValidateRequest(isHomeMixed, request.HomeExpenseType, request.OperatingExpenseType);
        var notes = TrimOrNull(request.Notes);
        var entity = await db.BusinessExpenses.FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Expense not found.");

        entity.ExpenseDate = DateTime.SpecifyKind(request.ExpenseDate.Date, DateTimeKind.Utc);
        entity.IsHomeMixed = isHomeMixed;
        entity.HomeExpenseType = isHomeMixed
            ? BusinessExpenseMappers.ParseHomeType(request.HomeExpenseType)
            : null;
        entity.OperatingExpenseType = isHomeMixed
            ? null
            : BusinessExpenseMappers.ParseOperatingType(request.OperatingExpenseType);
        entity.Description = notes ?? string.Empty;
        entity.AmountIls = Math.Round(request.AmountIls, 2);
        entity.VendorName = TrimOrNull(request.VendorName);
        entity.InvoiceReference = TrimOrNull(request.InvoiceReference);
        entity.Notes = notes;
        entity.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var documentCount = await db.BusinessExpenseDocuments.CountAsync(d => d.BusinessExpenseId == id, ct);
        return BusinessExpenseMappers.ToDto(entity, tenant, documentCount);
    }

    public async Task DeleteAsync(Guid tenantId, Guid id, CancellationToken ct)
    {
        var entity = await db.BusinessExpenses
            .Include(e => e.Documents)
            .FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Expense not found.");

        foreach (var doc in entity.Documents)
            files.DeleteFile(doc.FilePath);

        db.BusinessExpenses.Remove(entity);
        await db.SaveChangesAsync(ct);
    }

    public async Task<BusinessExpenseDto> UploadDocumentAsync(
        Guid tenantId,
        Guid expenseId,
        IFormFile file,
        CancellationToken ct)
    {
        var expense = await db.BusinessExpenses
            .Include(e => e.Documents)
            .FirstOrDefaultAsync(e => e.Id == expenseId && e.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Expense not found.");

        if (file is null || file.Length == 0)
            throw new InvalidOperationException("File is required.");

        var tenant = await db.Tenants.AsNoTracking().FirstAsync(t => t.Id == tenantId, ct);
        var docId = Guid.NewGuid();
        var (path, contentType, originalName) = await files.SaveBusinessExpenseDocumentAsync(
            tenantId, expenseId, docId, file, ct);

        var sortOrder = expense.Documents.Count > 0
            ? expense.Documents.Max(d => d.SortOrder) + 1
            : 0;

        var doc = new BusinessExpenseDocument
        {
            Id = docId,
            BusinessExpenseId = expense.Id,
            FilePath = path,
            FileName = originalName,
            ContentType = contentType,
            SortOrder = sortOrder,
            CreatedAt = DateTime.UtcNow,
        };

        db.BusinessExpenseDocuments.Add(doc);
        expense.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return await GetAsync(tenantId, expenseId, ct);
    }

    public async Task<BusinessExpenseDto> DeleteDocumentAsync(
        Guid tenantId,
        Guid expenseId,
        Guid documentId,
        CancellationToken ct)
    {
        var expense = await db.BusinessExpenses
            .FirstOrDefaultAsync(e => e.Id == expenseId && e.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Expense not found.");

        var doc = await db.BusinessExpenseDocuments
            .FirstOrDefaultAsync(d => d.Id == documentId && d.BusinessExpenseId == expenseId, ct)
            ?? throw new InvalidOperationException("Document not found.");

        files.DeleteFile(doc.FilePath);
        db.BusinessExpenseDocuments.Remove(doc);
        expense.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return await GetAsync(tenantId, expenseId, ct);
    }

    private static bool ResolveIsHomeMixed(bool requestedHomeMixed, Tenant tenant)
    {
        if (!BusinessExpenseMappers.UsesHomeOffice(tenant) && requestedHomeMixed)
            throw new InvalidOperationException("Home mixed expenses are only available when home office mode is enabled in settings.");
        return requestedHomeMixed;
    }

    private static void ValidateRequest(bool isHomeMixed, string? homeType, string? operatingType)
    {
        if (isHomeMixed && string.IsNullOrWhiteSpace(homeType))
            throw new InvalidOperationException("Home expense type is required for mixed home expenses.");
        if (!isHomeMixed && string.IsNullOrWhiteSpace(operatingType))
            throw new InvalidOperationException("Operating expense type is required.");
    }

    private static string? TrimOrNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
