using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class DocumentService(
    AppDbContext db,
    ArticleSequenceService sequences,
    StockFulfillmentService stock)
{
    public async Task SyncChargeInvoicesFromOrdersAsync(Guid tenantId, CancellationToken ct)
    {
        var orders = await db.Orders
            .Where(o => o.TenantId == tenantId && o.ChargeInvoiceNumber != null)
            .Include(o => o.Customer)
            .Include(o => o.Lines)
            .ThenInclude(l => l.Product)
            .ToListAsync(ct);

        foreach (var order in orders)
        {
            var exists = await db.BusinessDocuments.AnyAsync(
                d => d.TenantId == tenantId && d.OrderId == order.Id && d.DocumentType == DocumentType.ChargeInvoice,
                ct);
            if (exists) continue;

            var doc = BuildChargeInvoiceFromOrder(order, tenantId);
            doc.DocumentNumber = order.ChargeInvoiceNumber!;
            doc.IssueDate = order.ChargeInvoiceIssuedAt ?? order.UpdatedAt;
            doc.Status = order.StockDeducted ? DocumentStatus.Open : DocumentStatus.Open;
            db.BusinessDocuments.Add(doc);
        }

        if (db.ChangeTracker.HasChanges())
            await db.SaveChangesAsync(ct);
    }

    public async Task<BusinessDocument> CreateFromOrderChargeInvoiceAsync(Order order, string chargeNumber, CancellationToken ct)
    {
        var exists = await db.BusinessDocuments.AnyAsync(
            d => d.TenantId == order.TenantId && d.OrderId == order.Id && d.DocumentType == DocumentType.ChargeInvoice,
            ct);
        if (exists)
            return (await db.BusinessDocuments
                .Include(d => d.Customer)
                .Include(d => d.Lines)
                .FirstAsync(d => d.OrderId == order.Id && d.DocumentType == DocumentType.ChargeInvoice, ct))!;

        var doc = BuildChargeInvoiceFromOrder(order, order.TenantId);
        doc.DocumentNumber = chargeNumber;
        doc.IssueDate = DateTime.UtcNow;
        doc.Status = DocumentStatus.Open;
        db.BusinessDocuments.Add(doc);
        await db.SaveChangesAsync(ct);
        await db.Entry(doc).Reference(d => d.Customer).LoadAsync(ct);
        return doc;
    }

    public async Task<BusinessDocument> CreateAsync(
        Guid tenantId,
        DocumentType type,
        Guid customerId,
        string? description,
        DateTime? issueDate,
        DateTime? dueDate,
        string? paymentMethod,
        Guid? parentDocumentId,
        Guid? orderId,
        IReadOnlyList<(Guid? ProductId, string Description, decimal Qty, decimal UnitPrice)>? lines,
        CancellationToken ct)
    {
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == customerId && c.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Customer not found.");

        var prefix = DocumentTypePrefixes.GetPrefix(type);
        var number = await sequences.AllocateNextAsync(tenantId, prefix, ct);
        var now = DateTime.UtcNow;
        var issue = issueDate?.ToUniversalTime() ?? now;

        var doc = new BusinessDocument
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            DocumentType = type,
            DocumentNumber = number,
            CustomerId = customer.Id,
            OrderId = orderId,
            ParentDocumentId = parentDocumentId,
            Description = description?.Trim(),
            IssueDate = issue,
            DueDate = dueDate?.ToUniversalTime(),
            PaymentMethod = paymentMethod?.Trim(),
            Status = type switch
            {
                DocumentType.Quote => DocumentStatus.Sent,
                DocumentType.ChargeInvoice => DocumentStatus.Open,
                DocumentType.Receipt => DocumentStatus.Closed,
                _ => DocumentStatus.Draft
            },
            CreatedAt = now,
            UpdatedAt = now
        };

        if (lines is { Count: > 0 })
        {
            var sort = 0;
            foreach (var line in lines)
            {
                var total = Math.Round(line.UnitPrice * line.Qty, 2);
                doc.Lines.Add(new BusinessDocumentLine
                {
                    Id = Guid.NewGuid(),
                    ProductId = line.ProductId,
                    Description = line.Description.Trim(),
                    Quantity = line.Qty,
                    UnitPrice = line.UnitPrice,
                    LineTotal = total,
                    SortOrder = sort++
                });
            }
            doc.TotalAmount = doc.Lines.Sum(l => l.LineTotal);
        }

        if (type == DocumentType.ChargeInvoice && lines is { Count: > 0 })
        {
            foreach (var line in doc.Lines.Where(l => l.ProductId.HasValue))
            {
                await stock.DeductProductSaleAsync(
                    tenantId,
                    line.ProductId!.Value,
                    line.Quantity,
                    $"{number}",
                    ct);
            }
        }

        if (type == DocumentType.Receipt && parentDocumentId is { } parentId)
        {
            var parent = await db.BusinessDocuments.FirstOrDefaultAsync(
                d => d.Id == parentId && d.TenantId == tenantId, ct);
            if (parent is null) throw new InvalidOperationException("Parent document not found.");
            if (parent.DocumentType != DocumentType.ChargeInvoice)
                throw new InvalidOperationException("Receipt parent must be a charge invoice.");
            doc.TotalAmount = parent.TotalAmount;
            parent.Status = DocumentStatus.Paid;
            parent.UpdatedAt = now;
        }

        db.BusinessDocuments.Add(doc);
        await db.SaveChangesAsync(ct);
        await db.Entry(doc).Reference(d => d.Customer).LoadAsync(ct);
        await db.Entry(doc).Collection(d => d.Lines).LoadAsync(ct);
        return doc;
    }

    public DocumentSummaryDto ComputeSummary(IEnumerable<BusinessDocument> docs)
    {
        var list = docs.ToList();
        var receipts = list.Where(d => d.DocumentType == DocumentType.Receipt).Sum(d => d.TotalAmount);
        var charge = list.Where(d => d.DocumentType == DocumentType.ChargeInvoice).Sum(d => d.TotalAmount);
        var quotes = list.Where(d => d.DocumentType == DocumentType.Quote).Sum(d => d.TotalAmount);
        var receivable = list
            .Where(d => d.DocumentType == DocumentType.ChargeInvoice &&
                        d.Status is DocumentStatus.Open or DocumentStatus.Sent)
            .Sum(d => d.TotalAmount);
        return new DocumentSummaryDto(receipts, charge, quotes, receivable);
    }

    private static BusinessDocument BuildChargeInvoiceFromOrder(Order order, Guid tenantId)
    {
        var doc = new BusinessDocument
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            DocumentType = DocumentType.ChargeInvoice,
            CustomerId = order.CustomerId,
            OrderId = order.Id,
            Description = order.Notes,
            Status = DocumentStatus.Open,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        var sort = 0;
        foreach (var line in order.Lines.OrderBy(l => l.SortOrder))
        {
            doc.Lines.Add(new BusinessDocumentLine
            {
                Id = Guid.NewGuid(),
                ProductId = line.ProductId,
                Description = line.Product.Name,
                Quantity = line.Quantity,
                UnitPrice = line.UnitPrice,
                LineTotal = line.LineTotal,
                SortOrder = sort++
            });
        }
        doc.TotalAmount = order.Lines.Sum(l => l.LineTotal);
        return doc;
    }
}
