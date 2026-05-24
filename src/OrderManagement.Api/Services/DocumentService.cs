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
        decimal? discountPercent,
        decimal? discountAmount,
        bool receiptAsDraft = false,
        CancellationToken ct = default)
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
                DocumentType.Receipt => receiptAsDraft ? DocumentStatus.Draft : DocumentStatus.Closed,
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
            var subtotal = doc.Lines.Sum(l => l.LineTotal);
            doc.DiscountPercent = discountPercent is > 0 ? discountPercent : null;
            doc.DiscountAmount = discountAmount is > 0 && discountPercent is null or <= 0 ? discountAmount : null;
            var discountValue = 0m;
            if (doc.DiscountPercent is { } pct)
                discountValue = Math.Round(subtotal * pct / 100m, 2);
            else if (doc.DiscountAmount is { } amt)
                discountValue = amt;
            doc.TotalAmount = Math.Max(0, subtotal - discountValue);
        }

        if (type == DocumentType.ChargeInvoice && parentDocumentId is { } quoteParentId)
        {
            var quoteParent = await db.BusinessDocuments.FirstOrDefaultAsync(
                d => d.Id == quoteParentId && d.TenantId == tenantId, ct);
            if (quoteParent is null) throw new InvalidOperationException("Parent document not found.");
            if (quoteParent.DocumentType != DocumentType.Quote)
                throw new InvalidOperationException("Charge invoice can only reference a price quote as parent.");

            var hasCharge = await db.BusinessDocuments.AnyAsync(
                d => d.TenantId == tenantId &&
                     d.ParentDocumentId == quoteParentId &&
                     d.DocumentType == DocumentType.ChargeInvoice,
                ct);
            if (hasCharge)
                throw new InvalidOperationException("A charge invoice already exists for this quote.");
        }

        // Standalone חשבון חיוב only — quote-linked invoices are created for editing first;
        // stock is not deducted here (avoids blocking issue-from-quote when warehouse qty is low).
        if (type == DocumentType.ChargeInvoice && lines is { Count: > 0 } && parentDocumentId is null)
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

            var hasReceipt = await db.BusinessDocuments.AnyAsync(
                d => d.ParentDocumentId == parentId && d.DocumentType == DocumentType.Receipt, ct);
            if (hasReceipt)
                throw new InvalidOperationException("Receipt already exists for this invoice.");

            if (receiptAsDraft)
            {
                doc.TotalAmount = 0;
            }
            else
            {
                doc.TotalAmount = parent.TotalAmount;
                parent.Status = DocumentStatus.Paid;
                parent.UpdatedAt = now;
            }
        }

        db.BusinessDocuments.Add(doc);
        await db.SaveChangesAsync(ct);
        await db.Entry(doc).Reference(d => d.Customer).LoadAsync(ct);
        await db.Entry(doc).Collection(d => d.Lines).LoadAsync(ct);
        await db.Entry(doc).Collection(d => d.PaymentLines).LoadAsync(ct);
        return doc;
    }

    public async Task<BusinessDocument> UpdateAsync(
        Guid tenantId,
        Guid documentId,
        string? description,
        DateTime? issueDate,
        DateTime? dueDate,
        string? paymentMethod,
        int version,
        IReadOnlyList<(Guid? ProductId, string Description, decimal Qty, decimal UnitPrice)>? lines,
        decimal? discountPercent,
        decimal? discountAmount,
        CancellationToken ct)
    {
        var doc = await db.BusinessDocuments
            .FirstOrDefaultAsync(d => d.Id == documentId && d.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Document not found.");

        if (doc.Version != version)
            throw new InvalidOperationException("Document was modified. Refresh and try again.");

        if (doc.DocumentType is DocumentType.Receipt or DocumentType.Order)
            throw new InvalidOperationException("This document type cannot be edited.");

        if (doc.OrderId is not null)
            throw new InvalidOperationException("Documents linked to an order cannot be edited here.");

        var hasFinalizedReceipt = await db.BusinessDocuments.AnyAsync(
            d => d.ParentDocumentId == doc.Id &&
                 d.DocumentType == DocumentType.Receipt &&
                 d.Status != DocumentStatus.Draft,
            ct);
        if (hasFinalizedReceipt)
            throw new InvalidOperationException(
                "Cannot edit: a finalized receipt exists for this document. Delete the receipt first.");

        if (lines is null or { Count: 0 })
            throw new InvalidOperationException("At least one line is required.");

        doc.Description = description?.Trim();
        if (issueDate.HasValue)
            doc.IssueDate = issueDate.Value.ToUniversalTime();
        doc.DueDate = dueDate?.ToUniversalTime();
        doc.PaymentMethod = paymentMethod?.Trim();

        await db.BusinessDocumentLines.Where(l => l.DocumentId == doc.Id).ExecuteDeleteAsync(ct);

        var sort = 0;
        var newLines = new List<BusinessDocumentLine>();
        foreach (var line in lines)
        {
            var total = Math.Round(line.UnitPrice * line.Qty, 2);
            newLines.Add(new BusinessDocumentLine
            {
                Id = Guid.NewGuid(),
                DocumentId = doc.Id,
                ProductId = line.ProductId,
                Description = line.Description.Trim(),
                Quantity = line.Qty,
                UnitPrice = line.UnitPrice,
                LineTotal = total,
                SortOrder = sort++
            });
        }
        db.BusinessDocumentLines.AddRange(newLines);
        doc.Lines = newLines;

        var subtotal = newLines.Sum(l => l.LineTotal);
        doc.DiscountPercent = discountPercent is > 0 ? discountPercent : null;
        doc.DiscountAmount = discountAmount is > 0 && discountPercent is null or <= 0 ? discountAmount : null;
        var discountValue = 0m;
        if (doc.DiscountPercent is { } pct)
            discountValue = Math.Round(subtotal * pct / 100m, 2);
        else if (doc.DiscountAmount is { } amt)
            discountValue = amt;
        doc.TotalAmount = Math.Max(0, subtotal - discountValue);

        doc.Version++;
        doc.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await db.Entry(doc).Reference(d => d.Customer).LoadAsync(ct);
        await db.Entry(doc).Collection(d => d.Lines).LoadAsync(ct);
        return doc;
    }

    public async Task DeleteAsync(Guid tenantId, Guid documentId, CancellationToken ct)
    {
        var doc = await db.BusinessDocuments
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == documentId && d.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Document not found.");

        if (doc.OrderId is not null)
            throw new InvalidOperationException("Documents linked to an order cannot be deleted here.");

        var hasChildren = await db.BusinessDocuments.AnyAsync(d => d.ParentDocumentId == doc.Id, ct);
        if (hasChildren)
            throw new InvalidOperationException("Cannot delete: related documents exist.");

        if (doc.DocumentType == DocumentType.Receipt && doc.ParentDocumentId is { } chargeId)
        {
            var charge = await db.BusinessDocuments.FirstOrDefaultAsync(
                d => d.Id == chargeId && d.TenantId == tenantId, ct);
            if (charge is { DocumentType: DocumentType.ChargeInvoice, Status: DocumentStatus.Paid })
            {
                charge.Status = DocumentStatus.Open;
                charge.UpdatedAt = DateTime.UtcNow;
            }
        }

        db.BusinessDocumentLines.RemoveRange(doc.Lines);
        await db.ReceiptPaymentLines.Where(p => p.DocumentId == doc.Id).ExecuteDeleteAsync(ct);
        db.BusinessDocuments.Remove(doc);
        await db.SaveChangesAsync(ct);
    }

    public async Task<BusinessDocument> DuplicateAsync(Guid tenantId, Guid documentId, CancellationToken ct)
    {
        var source = await db.BusinessDocuments
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == documentId && d.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Document not found.");

        if (source.DocumentType is DocumentType.Receipt or DocumentType.Order)
            throw new InvalidOperationException("This document type cannot be duplicated.");

        var lines = source.Lines
            .OrderBy(l => l.SortOrder)
            .Select(l => (l.ProductId, l.Description, l.Quantity, l.UnitPrice))
            .ToList();

        return await CreateAsync(
            tenantId,
            source.DocumentType,
            source.CustomerId,
            source.Description,
            DateTime.UtcNow,
            source.DueDate,
            source.PaymentMethod,
            null,
            null,
            lines,
            source.DiscountPercent,
            source.DiscountAmount,
            receiptAsDraft: false,
            ct);
    }

    public async Task<BusinessDocument> IssueChargeFromQuoteAsync(
        Guid tenantId,
        Guid quoteId,
        CancellationToken ct)
    {
        var quote = await db.BusinessDocuments
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == quoteId && d.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Document not found.");

        if (quote.DocumentType != DocumentType.Quote)
            throw new InvalidOperationException("Charge invoice can only be issued from a price quote.");

        if (quote.OrderId is not null)
            throw new InvalidOperationException("Documents linked to an order cannot issue a charge invoice here.");

        if (quote.Lines.Count == 0)
            throw new InvalidOperationException("Quote has no lines.");

        var hasCharge = await db.BusinessDocuments.AnyAsync(
            d => d.TenantId == tenantId &&
                 d.ParentDocumentId == quoteId &&
                 d.DocumentType == DocumentType.ChargeInvoice,
            ct);
        if (hasCharge)
            throw new InvalidOperationException("A charge invoice already exists for this quote.");

        var lines = quote.Lines
            .OrderBy(l => l.SortOrder)
            .Select(l => (l.ProductId, l.Description, l.Quantity, l.UnitPrice))
            .ToList();

        return await CreateAsync(
            tenantId,
            DocumentType.ChargeInvoice,
            quote.CustomerId,
            quote.Description,
            DateTime.UtcNow,
            quote.DueDate,
            quote.PaymentMethod,
            quoteId,
            null,
            lines,
            quote.DiscountPercent,
            quote.DiscountAmount,
            receiptAsDraft: false,
            ct);
    }

    public async Task<BusinessDocument> IssueReceiptAsync(
        Guid tenantId,
        Guid documentId,
        string? paymentMethod,
        DateTime? paymentDate,
        CancellationToken ct)
    {
        var doc = await db.BusinessDocuments
            .FirstOrDefaultAsync(d => d.Id == documentId && d.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Document not found.");

        BusinessDocument charge;
        if (doc.DocumentType == DocumentType.ChargeInvoice)
        {
            charge = doc;
        }
        else if (doc.DocumentType == DocumentType.Quote)
        {
            var existingCharge = await db.BusinessDocuments
                .FirstOrDefaultAsync(
                    d => d.TenantId == tenantId &&
                         d.ParentDocumentId == doc.Id &&
                         d.DocumentType == DocumentType.ChargeInvoice,
                    ct);
            charge = existingCharge ?? await IssueChargeFromQuoteAsync(tenantId, doc.Id, ct);
        }
        else
        {
            throw new InvalidOperationException("Receipt can only be issued from a quote or charge invoice.");
        }

        var existingReceipt = await db.BusinessDocuments
            .Include(d => d.Customer)
            .Include(d => d.PaymentLines)
            .FirstOrDefaultAsync(
                d => d.ParentDocumentId == charge.Id && d.DocumentType == DocumentType.Receipt, ct);
        if (existingReceipt is not null)
            return existingReceipt;

        if (charge.Status is DocumentStatus.Paid or DocumentStatus.Closed)
        {
            // Receipt was removed but charge stayed paid — allow a new draft.
            charge.Status = DocumentStatus.Open;
            charge.UpdatedAt = DateTime.UtcNow;
        }

        await db.Entry(charge).Reference(c => c.Customer).LoadAsync(ct);

        return await CreateAsync(
            tenantId,
            DocumentType.Receipt,
            charge.CustomerId,
            charge.Description,
            paymentDate ?? DateTime.UtcNow,
            null,
            paymentMethod ?? charge.PaymentMethod,
            charge.Id,
            charge.OrderId,
            null,
            null,
            null,
            receiptAsDraft: true,
            ct);
    }

    public async Task<BusinessDocument> SaveReceiptAsync(
        Guid tenantId,
        Guid receiptId,
        string? description,
        DateTime? issueDate,
        int version,
        IReadOnlyList<ReceiptPaymentLineInput> paymentLines,
        bool finalize,
        CancellationToken ct)
    {
        var receipt = await db.BusinessDocuments
            .Include(d => d.Customer)
            .Include(d => d.PaymentLines)
            .FirstOrDefaultAsync(d => d.Id == receiptId && d.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Document not found.");

        if (receipt.DocumentType != DocumentType.Receipt)
            throw new InvalidOperationException("Not a receipt document.");

        if (receipt.Version != version)
            throw new InvalidOperationException("Document was modified. Refresh and try again.");

        if (receipt.ParentDocumentId is not { } chargeId)
            throw new InvalidOperationException("Receipt has no linked charge invoice.");

        var charge = await db.BusinessDocuments.FirstOrDefaultAsync(
            d => d.Id == chargeId && d.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Parent charge invoice not found.");

        if (charge.DocumentType != DocumentType.ChargeInvoice)
            throw new InvalidOperationException("Receipt parent must be a charge invoice.");

        if (paymentLines.Count == 0)
            throw new InvalidOperationException("At least one payment line is required.");

        await db.ReceiptPaymentLines.Where(p => p.DocumentId == receiptId).ExecuteDeleteAsync(ct);

        var sort = 0;
        decimal total = 0;
        foreach (var line in paymentLines)
        {
            if (line.Amount <= 0) continue;
            ReceiptPaymentType paymentType;
            try { paymentType = DocumentMappers.ParsePaymentType(line.PaymentType); }
            catch (ArgumentException ex) { throw new InvalidOperationException(ex.Message); }

            var pl = new ReceiptPaymentLine
            {
                Id = Guid.NewGuid(),
                DocumentId = receiptId,
                PaymentType = paymentType,
                Amount = Math.Round(line.Amount, 2),
                Currency = string.IsNullOrWhiteSpace(line.Currency) ? "ILS" : line.Currency.Trim(),
                LineDate = line.LineDate?.ToUniversalTime(),
                GeneralDetail = line.GeneralDetail?.Trim(),
                DetailsJson = string.IsNullOrWhiteSpace(line.DetailsJson) ? null : line.DetailsJson.Trim(),
                SortOrder = sort++
            };
            db.ReceiptPaymentLines.Add(pl);
            total += pl.Amount;
        }

        if (total <= 0)
            throw new InvalidOperationException("At least one payment line with amount is required.");

        if (total > charge.TotalAmount)
            throw new InvalidOperationException("Total payments exceed the charge invoice amount.");

        receipt.Description = description?.Trim();
        if (issueDate.HasValue)
            receipt.IssueDate = issueDate.Value.ToUniversalTime();
        receipt.TotalAmount = total;
        receipt.Version++;
        receipt.UpdatedAt = DateTime.UtcNow;

        if (finalize)
        {
            receipt.Status = DocumentStatus.Closed;
            if (total >= charge.TotalAmount)
            {
                charge.Status = DocumentStatus.Paid;
                charge.UpdatedAt = DateTime.UtcNow;

                if (charge.OrderId is { } orderId)
                {
                    var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct);
                    if (order is not null)
                    {
                        order.Status = OrderStatus.Paid;
                        order.UpdatedAt = DateTime.UtcNow;
                    }
                }
            }
        }

        await db.SaveChangesAsync(ct);
        await db.Entry(receipt).Collection(d => d.PaymentLines).LoadAsync(ct);
        return receipt;
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
