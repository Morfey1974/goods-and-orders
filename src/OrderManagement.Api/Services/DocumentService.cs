using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;
using OrderManagement.Api.Services.Pdf;

namespace OrderManagement.Api.Services;

public class DocumentService(
    AppDbContext db,
    DocumentNumberService documentNumbers,
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
        bool finalize = false,
        IReadOnlyList<Guid>? chargeInvoiceIds = null,
        CancellationToken ct = default)
    {
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == customerId && c.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Customer not found.");

        var number = await documentNumbers.AllocateNextAsync(tenantId, type, ct);
        var now = DateTime.UtcNow;
        var issue = issueDate.HasValue
            ? NormalizeBusinessDate(issueDate.Value)
            : DateTime.SpecifyKind(now.Date, DateTimeKind.Utc);

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
                DocumentType.Quote => finalize ? DocumentStatus.Open : DocumentStatus.Draft,
                DocumentType.ChargeInvoice => finalize ? DocumentStatus.Open : DocumentStatus.Draft,
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

        List<BusinessDocument>? receiptCharges = null;
        if (type == DocumentType.Receipt)
        {
            var chargeIds = chargeInvoiceIds?.Where(id => id != Guid.Empty).Distinct().ToList()
                ?? (parentDocumentId is { } pid ? [pid] : []);
            if (chargeIds.Count == 0)
                throw new InvalidOperationException("Receipt requires at least one charge invoice.");

            receiptCharges = await LoadAndValidateReceiptChargesAsync(tenantId, chargeIds, customerId, ct);
            doc.CustomerId = receiptCharges[0].CustomerId;
            doc.ParentDocumentId = receiptCharges[0].Id;
            doc.OrderId ??= receiptCharges[0].OrderId;

            if (string.IsNullOrWhiteSpace(doc.Description))
            {
                doc.Description = receiptCharges.Count == 1
                    ? receiptCharges[0].Description?.Trim()
                    : BuildMultiChargeReceiptDescription(receiptCharges);
            }

            if (receiptAsDraft)
            {
                doc.TotalAmount = 0;
            }
            else
            {
                doc.TotalAmount = Math.Round(receiptCharges.Sum(c => c.TotalAmount), 2);
                foreach (var charge in receiptCharges)
                {
                    charge.Status = DocumentStatus.Paid;
                    charge.UpdatedAt = now;
                }
            }
        }

        db.BusinessDocuments.Add(doc);

        if (type == DocumentType.Receipt && receiptCharges is not null)
        {
            foreach (var charge in receiptCharges)
            {
                db.ReceiptChargeAllocations.Add(new ReceiptChargeAllocation
                {
                    Id = Guid.NewGuid(),
                    ReceiptId = doc.Id,
                    ChargeInvoiceId = charge.Id,
                    AllocatedAmount = charge.TotalAmount
                });
            }
        }

        await db.SaveChangesAsync(ct);

        if (type == DocumentType.ChargeInvoice && finalize)
        {
            await ApplyChargeFinalizationAsync(tenantId, doc, ct);
            await db.SaveChangesAsync(ct);
        }

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
        bool finalize = false,
        CancellationToken ct = default)
    {
        var doc = await db.BusinessDocuments
            .FirstOrDefaultAsync(d => d.Id == documentId && d.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Document not found.");

        if (doc.Version != version)
            throw new InvalidOperationException("Document was modified. Refresh and try again.");

        if (doc.DocumentType is DocumentType.Receipt or DocumentType.Order)
            throw new InvalidOperationException("This document type cannot be edited.");

        var hasFinalizedReceipt = await db.ReceiptChargeAllocations.AnyAsync(
            a => a.ChargeInvoiceId == doc.Id &&
                 a.Receipt.TenantId == tenantId &&
                 a.Receipt.DocumentType == DocumentType.Receipt &&
                 a.Receipt.Status != DocumentStatus.Draft,
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

        if (finalize)
        {
            if (doc.DocumentType == DocumentType.Quote && doc.Status == DocumentStatus.Draft)
            {
                doc.Status = DocumentStatus.Open;
            }
            else if (doc.DocumentType == DocumentType.ChargeInvoice)
            {
                await ApplyChargeFinalizationAsync(tenantId, doc, ct);
            }
        }
        else if (doc.DocumentType is DocumentType.Quote or DocumentType.ChargeInvoice &&
                 doc.Status is DocumentStatus.Draft or DocumentStatus.Open or DocumentStatus.Sent)
        {
            doc.Status = DocumentStatus.Draft;
        }

        if (doc.DocumentType == DocumentType.ChargeInvoice && doc.Status == DocumentStatus.Draft
            && await stock.HasStockIssuesForChargeAsync(tenantId, doc.DocumentNumber, ct))
        {
            await stock.ReverseStockForChargeAsync(tenantId, doc.DocumentNumber, ct);
        }

        doc.Version++;
        doc.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await db.Entry(doc).Reference(d => d.Customer).LoadAsync(ct);
        await db.Entry(doc).Collection(d => d.Lines).LoadAsync(ct);
        return doc;
    }

    /// <summary>
    /// While a charge invoice is still a draft, keep its product lines aligned with the parent quote.
    /// Does not bump <see cref="BusinessDocument.Version"/> — passive refresh when opening the document.
    /// </summary>
    public async Task<bool> SyncDraftChargeFromParentQuoteAsync(
        BusinessDocument charge,
        CancellationToken ct = default)
    {
        if (charge.DocumentType != DocumentType.ChargeInvoice ||
            charge.Status != DocumentStatus.Draft ||
            charge.ParentDocumentId is not { } quoteId)
        {
            return false;
        }

        var quote = await db.BusinessDocuments
            .AsNoTracking()
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == quoteId && d.TenantId == charge.TenantId, ct);

        if (quote is not { DocumentType: DocumentType.Quote } || quote.Lines.Count == 0)
            return false;

        var quoteLines = quote.Lines.OrderBy(l => l.SortOrder).ToList();
        if (charge.Lines.Count == 0)
            await db.Entry(charge).Collection(c => c.Lines).LoadAsync(ct);

        var chargeLines = charge.Lines.OrderBy(l => l.SortOrder).ToList();
        if (ChargeLinesMatchQuote(chargeLines, quoteLines) &&
            charge.DiscountPercent == quote.DiscountPercent &&
            charge.DiscountAmount == quote.DiscountAmount)
        {
            return false;
        }

        await db.BusinessDocumentLines.Where(l => l.DocumentId == charge.Id).ExecuteDeleteAsync(ct);

        var sort = 0;
        var newLines = new List<BusinessDocumentLine>();
        foreach (var line in quoteLines)
        {
            var total = Math.Round(line.UnitPrice * line.Quantity, 2);
            newLines.Add(new BusinessDocumentLine
            {
                Id = Guid.NewGuid(),
                DocumentId = charge.Id,
                ProductId = line.ProductId,
                Description = line.Description.Trim(),
                Quantity = line.Quantity,
                UnitPrice = line.UnitPrice,
                LineTotal = total,
                SortOrder = sort++
            });
        }

        db.BusinessDocumentLines.AddRange(newLines);
        charge.Lines = newLines;

        var subtotal = newLines.Sum(l => l.LineTotal);
        charge.DiscountPercent = quote.DiscountPercent is > 0 ? quote.DiscountPercent : null;
        charge.DiscountAmount = quote.DiscountAmount is > 0 && quote.DiscountPercent is null or <= 0
            ? quote.DiscountAmount
            : null;
        var discountValue = 0m;
        if (charge.DiscountPercent is { } pct)
            discountValue = Math.Round(subtotal * pct / 100m, 2);
        else if (charge.DiscountAmount is { } amt)
            discountValue = amt;
        charge.TotalAmount = Math.Max(0, subtotal - discountValue);
        charge.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        return true;
    }

    private static bool ChargeLinesMatchQuote(
        IReadOnlyList<BusinessDocumentLine> chargeLines,
        IReadOnlyList<BusinessDocumentLine> quoteLines)
    {
        if (chargeLines.Count != quoteLines.Count)
            return false;

        for (var i = 0; i < chargeLines.Count; i++)
        {
            var chargeLine = chargeLines[i];
            var quoteLine = quoteLines[i];
            if (chargeLine.ProductId != quoteLine.ProductId ||
                !string.Equals(chargeLine.Description.Trim(), quoteLine.Description.Trim(), StringComparison.Ordinal) ||
                chargeLine.Quantity != quoteLine.Quantity ||
                chargeLine.UnitPrice != quoteLine.UnitPrice)
            {
                return false;
            }
        }

        return true;
    }

    public async Task DeleteAsync(Guid tenantId, Guid documentId, CancellationToken ct)
    {
        var doc = await db.BusinessDocuments
            .Include(d => d.Lines)
            .FirstOrDefaultAsync(d => d.Id == documentId && d.TenantId == tenantId, ct)
            ?? throw new InvalidOperationException("Document not found.");

        var childIds = await db.BusinessDocuments
            .Where(d => d.ParentDocumentId == doc.Id && d.TenantId == tenantId)
            .Select(d => d.Id)
            .ToListAsync(ct);

        foreach (var childId in childIds)
            await DeleteAsync(tenantId, childId, ct);

        if (doc.DocumentType == DocumentType.ChargeInvoice
            && await stock.HasStockIssuesForChargeAsync(tenantId, doc.DocumentNumber, ct))
        {
            await stock.ReverseStockForChargeAsync(tenantId, doc.DocumentNumber, ct);
        }

        if (doc.DocumentType == DocumentType.Receipt)
        {
            var chargeIds = await db.ReceiptChargeAllocations
                .Where(a => a.ReceiptId == doc.Id)
                .Select(a => a.ChargeInvoiceId)
                .ToListAsync(ct);
            if (chargeIds.Count == 0 && doc.ParentDocumentId is { } legacyChargeId)
                chargeIds.Add(legacyChargeId);

            foreach (var chargeId in chargeIds)
            {
                var charge = await db.BusinessDocuments.FirstOrDefaultAsync(
                    d => d.Id == chargeId && d.TenantId == tenantId, ct);
                if (charge is { DocumentType: DocumentType.ChargeInvoice, Status: DocumentStatus.Paid or DocumentStatus.Closed })
                {
                    charge.Status = DocumentStatus.Open;
                    charge.UpdatedAt = DateTime.UtcNow;
                }
            }

            await db.ReceiptChargeAllocations.Where(a => a.ReceiptId == doc.Id).ExecuteDeleteAsync(ct);
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
            finalize: false,
            chargeInvoiceIds: null,
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

        var charge = await CreateAsync(
            tenantId,
            DocumentType.ChargeInvoice,
            quote.CustomerId,
            quote.Description,
            quote.IssueDate,
            quote.DueDate,
            quote.PaymentMethod,
            quoteId,
            null,
            lines,
            quote.DiscountPercent,
            quote.DiscountAmount,
            receiptAsDraft: false,
            finalize: false,
            chargeInvoiceIds: null,
            ct);

        return charge;
    }

    public async Task DeductStockForChargeAsync(
        Guid tenantId,
        BusinessDocument charge,
        CancellationToken ct,
        bool validate = true)
    {
        if (charge.DocumentType != DocumentType.ChargeInvoice)
            throw new InvalidOperationException("Stock is deducted only for charge invoices.");

        if (validate)
            await stock.ValidateChargeStockAsync(tenantId, charge, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        try
        {
            foreach (var line in charge.Lines.Where(l => l.ProductId.HasValue))
            {
                await stock.DeductProductSaleAsync(
                    tenantId,
                    line.ProductId!.Value,
                    line.Quantity,
                    charge.DocumentNumber,
                    charge.IssueDate,
                    ct);
            }

            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    private async Task ApplyChargeFinalizationAsync(
        Guid tenantId,
        BusinessDocument charge,
        CancellationToken ct)
    {
        if (charge.DocumentType != DocumentType.ChargeInvoice)
            return;

        var wasDraft = charge.Status == DocumentStatus.Draft;

        if (charge.Lines.Count == 0)
            await db.Entry(charge).Collection(c => c.Lines).LoadAsync(ct);

        await stock.ValidateChargeStockAsync(tenantId, charge, ct);

        if (await ChargeStockAlreadyDeductedAsync(tenantId, charge.DocumentNumber, ct))
            await stock.ReverseStockForChargeAsync(tenantId, charge.DocumentNumber, ct);

        await DeductStockForChargeAsync(tenantId, charge, ct, validate: false);

        charge.Status = DocumentStatus.Open;
        charge.UpdatedAt = DateTime.UtcNow;

        if (!wasDraft || charge.ParentDocumentId is not { } quoteId)
            return;

        var quote = await db.BusinessDocuments.FirstOrDefaultAsync(
            d => d.Id == quoteId && d.TenantId == tenantId, ct);
        if (quote is { DocumentType: DocumentType.Quote } &&
            quote.Status is not DocumentStatus.Closed and not DocumentStatus.Cancelled)
        {
            quote.Status = DocumentStatus.Closed;
            quote.UpdatedAt = DateTime.UtcNow;
        }
    }

    private async Task<bool> ChargeStockAlreadyDeductedAsync(
        Guid tenantId,
        string documentNumber,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(documentNumber))
            return false;

        return await ChargeStockReference
            .WhereChargeReference(
                db.StockMovements.AsNoTracking().Where(m =>
                    m.TenantId == tenantId && m.MovementType == StockMovementType.Issue),
                documentNumber)
            .AnyAsync(ct);
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

        var existingReceiptId = await db.ReceiptChargeAllocations
            .Where(a => a.ChargeInvoiceId == charge.Id && a.Receipt.DocumentType == DocumentType.Receipt)
            .Select(a => (Guid?)a.ReceiptId)
            .FirstOrDefaultAsync(ct);

        BusinessDocument? existingReceipt = null;
        if (existingReceiptId is { } rid)
        {
            existingReceipt = await db.BusinessDocuments
                .Include(d => d.Customer)
                .Include(d => d.PaymentLines)
                .FirstOrDefaultAsync(d => d.Id == rid, ct);
        }
        else
        {
            existingReceipt = await db.BusinessDocuments
                .Include(d => d.Customer)
                .Include(d => d.PaymentLines)
                .FirstOrDefaultAsync(
                    d => d.ParentDocumentId == charge.Id && d.DocumentType == DocumentType.Receipt, ct);
        }

        if (existingReceipt is not null)
            return existingReceipt;

        if (charge.Status is DocumentStatus.Paid or DocumentStatus.Closed)
        {
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
            finalize: false,
            chargeInvoiceIds: [charge.Id],
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

        var allocations = await db.ReceiptChargeAllocations
            .Include(a => a.ChargeInvoice)
            .Where(a => a.ReceiptId == receiptId)
            .OrderBy(a => a.ChargeInvoice.DocumentNumber)
            .ToListAsync(ct);

        if (allocations.Count == 0 && receipt.ParentDocumentId is { } legacyChargeId)
        {
            var legacyCharge = await db.BusinessDocuments.FirstOrDefaultAsync(
                d => d.Id == legacyChargeId && d.TenantId == tenantId, ct)
                ?? throw new InvalidOperationException("Parent charge invoice not found.");
            allocations =
            [
                new ReceiptChargeAllocation
                {
                    Id = Guid.NewGuid(),
                    ReceiptId = receiptId,
                    ChargeInvoiceId = legacyCharge.Id,
                    ChargeInvoice = legacyCharge,
                    AllocatedAmount = legacyCharge.TotalAmount
                }
            ];
        }

        if (allocations.Count == 0)
            throw new InvalidOperationException("Receipt has no linked charge invoices.");

        var charges = allocations.Select(a => a.ChargeInvoice).ToList();
        var chargesTotal = Math.Round(charges.Sum(c => c.TotalAmount), 2);

        receipt.Description = description?.Trim();
        if (issueDate.HasValue)
            receipt.IssueDate = NormalizeBusinessDate(issueDate.Value);

        if (paymentLines.Count == 0)
        {
            if (finalize)
                throw new InvalidOperationException("At least one payment line is required.");

            receipt.Version++;
            receipt.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            await db.Entry(receipt).Collection(d => d.PaymentLines).LoadAsync(ct);
            return receipt;
        }

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
                LineDate = line.LineDate is { } ld ? NormalizeBusinessDate(ld) : null,
                GeneralDetail = line.GeneralDetail?.Trim(),
                DetailsJson = string.IsNullOrWhiteSpace(line.DetailsJson) ? null : line.DetailsJson.Trim(),
                SortOrder = sort++
            };
            db.ReceiptPaymentLines.Add(pl);
            total += pl.Amount;
        }

        if (total <= 0)
            throw new InvalidOperationException("At least one payment line with amount is required.");

        if (finalize)
        {
            if (total != chargesTotal)
                throw new InvalidOperationException(
                    "Payment total must exactly match the combined charge invoice amount.");
        }
        else if (total > chargesTotal)
        {
            throw new InvalidOperationException("Total payments exceed the charge invoice amount.");
        }

        if (issueDate.HasValue)
            receipt.IssueDate = NormalizeBusinessDate(issueDate.Value);
        receipt.TotalAmount = total;
        receipt.Version++;
        receipt.UpdatedAt = DateTime.UtcNow;

        if (finalize)
        {
            receipt.Status = DocumentStatus.Closed;
            foreach (var charge in charges)
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

    internal static DateTime NormalizeBusinessDate(DateTime value) =>
        DateTime.SpecifyKind(
            value.Kind == DateTimeKind.Utc ? value.Date : value.ToUniversalTime().Date,
            DateTimeKind.Utc);

    public async Task<IReadOnlyList<(ReceiptChargeAllocation Allocation, BusinessDocument Charge)>>
        GetReceiptChargeAllocationsAsync(Guid tenantId, Guid receiptId, CancellationToken ct)
    {
        var receiptExists = await db.BusinessDocuments.AnyAsync(
            d => d.Id == receiptId && d.TenantId == tenantId && d.DocumentType == DocumentType.Receipt, ct);
        if (!receiptExists)
            throw new InvalidOperationException("Document not found.");

        var rows = await db.ReceiptChargeAllocations
            .AsNoTracking()
            .Include(a => a.ChargeInvoice)
            .Where(a => a.ReceiptId == receiptId)
            .OrderBy(a => a.ChargeInvoice.DocumentNumber)
            .ToListAsync(ct);

        return rows.Select(a => (a, a.ChargeInvoice)).ToList();
    }

    private async Task<List<BusinessDocument>> LoadAndValidateReceiptChargesAsync(
        Guid tenantId,
        IReadOnlyList<Guid> chargeIds,
        Guid expectedCustomerId,
        CancellationToken ct)
    {
        var charges = await db.BusinessDocuments
            .Where(d => d.TenantId == tenantId && chargeIds.Contains(d.Id))
            .OrderBy(d => d.DocumentNumber)
            .ToListAsync(ct);

        if (charges.Count != chargeIds.Count)
            throw new InvalidOperationException("One or more charge invoices were not found.");

        Guid? customerId = null;
        foreach (var charge in charges)
        {
            if (charge.DocumentType != DocumentType.ChargeInvoice)
                throw new InvalidOperationException("Receipt can only reference charge invoices.");
            if (charge.Status != DocumentStatus.Open)
                throw new InvalidOperationException("All charge invoices must be open.");
            customerId ??= charge.CustomerId;
            if (charge.CustomerId != customerId)
                throw new InvalidOperationException("All charge invoices must belong to the same customer.");
            if (await ChargeHasReceiptAsync(tenantId, charge.Id, ct))
                throw new InvalidOperationException("A receipt already exists for one of the selected invoices.");
        }

        if (customerId != expectedCustomerId)
            throw new InvalidOperationException("Charge invoices do not belong to the specified customer.");

        return charges;
    }

    private async Task<bool> ChargeHasReceiptAsync(Guid tenantId, Guid chargeId, CancellationToken ct) =>
        await db.ReceiptChargeAllocations.AnyAsync(
            a => a.ChargeInvoiceId == chargeId &&
                 a.Receipt.TenantId == tenantId &&
                 a.Receipt.DocumentType == DocumentType.Receipt,
            ct) ||
        await db.BusinessDocuments.AnyAsync(
            d => d.TenantId == tenantId &&
                 d.ParentDocumentId == chargeId &&
                 d.DocumentType == DocumentType.Receipt,
            ct);

    private static string BuildMultiChargeReceiptDescription(IEnumerable<BusinessDocument> charges)
    {
        var nums = charges
            .OrderBy(c => c.DocumentNumber)
            .Select(c => BusinessDocumentPdfBuilder.StripDocumentPrefix(c.DocumentNumber));
        return $"יצא מתוך חשבונות עסקה מספר {string.Join(", ", nums)}";
    }
}
