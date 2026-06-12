using OrderManagement.Api.Data;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

public static class PurchaseReceiptFixedAssetPosting
{
    public static decimal ResolveLineTotalIls(PurchaseReceipt receipt, PurchaseReceiptLine line)
    {
        if (line.LineTotal is > 0)
            return DepreciationCalculator.RoundMoney(line.LineTotal.Value);

        var unit = line.UnitCostIls
            ?? InventoryCostService.ResolveLineUnitCostIls(receipt.Currency, line.UnitPrice, line.UnitCostIls);
        return DepreciationCalculator.RoundMoney(unit * StockQuantity.Normalize(line.Quantity));
    }

    public static Dictionary<Guid, decimal> AllocateLandedCostToLines(
        IReadOnlyList<(Guid LineId, decimal BaseIls)> lines,
        decimal totalLandedIls)
    {
        var result = new Dictionary<Guid, decimal>();
        if (lines.Count == 0 || totalLandedIls <= 0) return result;

        var totalBase = lines.Sum(l => l.BaseIls);
        foreach (var (lineId, baseIls) in lines)
        {
            decimal share;
            if (totalBase > 0)
                share = DepreciationCalculator.RoundMoney(totalLandedIls * (baseIls / totalBase));
            else
                share = DepreciationCalculator.RoundMoney(totalLandedIls / lines.Count);
            result[lineId] = share;
        }

        return result;
    }

    public static FixedAssetInstance CreateInstance(
        Guid tenantId,
        PurchaseReceipt receipt,
        PurchaseReceiptLine line,
        Product product,
        decimal costIls)
    {
        var category = product.DepreciationCategory ?? DepreciationAssetCategory.OtherEquipment;
        var businessUse = product.DefaultBusinessUsePercent ?? 100m;
        if (businessUse is < 0 or > 100) businessUse = 100m;

        var now = DateTime.UtcNow;
        return new FixedAssetInstance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ProductId = product.Id,
            Name = product.Name,
            Description = product.Description,
            PurchaseReceiptId = receipt.Id,
            PurchaseReceiptLineId = line.Id,
            AcquisitionDate = DateTime.SpecifyKind(receipt.DocumentDate.Date, DateTimeKind.Utc),
            InServiceDate = DateTime.SpecifyKind(receipt.DocumentDate.Date, DateTimeKind.Utc),
            OriginalCostIls = DepreciationCalculator.RoundMoney(costIls),
            ChangesCostIls = 0m,
            Category = category,
            AnnualDepreciationPercent = DepreciationAssetCategoryRates.AnnualPercent(category),
            BusinessUsePercent = businessUse,
            Status = FixedAssetInstanceStatus.Active,
            VendorName = receipt.Supplier?.Name,
            InvoiceReference = receipt.SupplierInvoiceNumber,
            CreatedAt = now,
            UpdatedAt = now,
        };
    }

    public static BusinessExpense CreateConsumableExpense(
        Guid tenantId,
        PurchaseReceipt receipt,
        PurchaseReceiptLine line,
        Product product,
        decimal amountIls)
    {
        var now = DateTime.UtcNow;
        return new BusinessExpense
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ExpenseDate = DateTime.SpecifyKind(receipt.DocumentDate.Date, DateTimeKind.Utc),
            IsHomeMixed = false,
            OperatingExpenseType = OperatingExpenseType.Materials,
            Description = product.Name,
            AmountIls = DepreciationCalculator.RoundMoney(amountIls),
            VendorName = receipt.Supplier?.Name,
            InvoiceReference = receipt.SupplierInvoiceNumber,
            Notes = $"GR {receipt.ReceiptNumber}",
            PurchaseReceiptLineId = line.Id,
            CreatedAt = now,
            UpdatedAt = now,
        };
    }
}
