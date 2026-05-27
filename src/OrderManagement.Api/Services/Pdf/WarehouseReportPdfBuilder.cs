using OrderManagement.Api.Dto;
using OrderManagement.Api.Entities;
using OrderManagement.Api.Services;

namespace OrderManagement.Api.Services.Pdf;

public static class WarehouseReportPdfBuilder
{
    public static WarehouseReportPdfModel BuildBalances(
        Tenant tenant,
        string? logoAbsolutePath,
        IReadOnlyList<StockBalanceDto> balances,
        IReadOnlyList<WarehouseReportWarehouseRef> warehouses,
        string? warehouseFilterName,
        bool includeZero)
    {
        var filtered = includeZero
            ? balances
            : balances.Where(b => b.Quantity != 0).ToList();

        var linesByWarehouse = filtered
            .GroupBy(b => b.WarehouseId)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var row = 1;
                    return g
                        .OrderBy(x => x.ArticleCode)
                        .Select(x => new WarehouseBalanceLineModel(
                            row++,
                            x.ArticleCode,
                            x.ProductName,
                            ProductTypeLabel(x.ProductType),
                            x.Quantity))
                        .ToList();
                });

        var groups = warehouses
            .OrderBy(w => WarehouseDisplayName(w.Name))
            .Select(w => new WarehouseBalanceGroupModel(
                WarehouseDisplayName(w.Name),
                linesByWarehouse.TryGetValue(w.Id, out var lines) ? lines : []))
            .ToList();

        return new WarehouseReportPdfModel(
            TenantPdfLetterheadBuilder.Build(tenant, logoAbsolutePath),
            "דוח יתרות מלאי לפי מחסנים",
            "דוח יתרות מלאי",
            DateTime.UtcNow,
            BuildWarehouseFilterSubtitle(warehouseFilterName),
            WarehouseReportKind.Balances,
            groups,
            []);
    }

    public static WarehouseReportPdfModel BuildMovements(
        Tenant tenant,
        string? logoAbsolutePath,
        IReadOnlyList<StockMovementDto> movements,
        string? warehouseFilterName,
        DateTime? from,
        DateTime? to)
    {
        var groups = movements
            .GroupBy(m => (m.WarehouseId, m.WarehouseName))
            .OrderBy(g => g.Key.WarehouseName)
            .Select(g =>
            {
                var row = 1;
                var lines = g
                    .OrderByDescending(m => m.CreatedAt)
                    .ThenBy(m => m.ArticleCode)
                    .Select(m => new WarehouseMovementLineModel(
                        row++,
                        m.CreatedAt,
                        m.ArticleCode,
                        m.ProductName,
                        MovementTypeLabel(m.MovementType),
                        m.Quantity,
                        m.BalanceAfter,
                        WarehouseMovementNotesHebrew.Translate(m.Notes)))
                    .ToList();
                return new WarehouseMovementGroupModel(
                    WarehouseDisplayName(g.Key.WarehouseName),
                    lines);
            })
            .Where(g => g.Lines.Count > 0)
            .ToList();

        var filterParts = new List<string>();
        if (string.IsNullOrWhiteSpace(warehouseFilterName))
            filterParts.Add("כל המחסנים");
        else
            filterParts.Add($"מחסן: {WarehouseDisplayName(warehouseFilterName)}");
        if (from.HasValue)
            filterParts.Add($"מתאריך: {FormatDate(from.Value)}");
        if (to.HasValue)
            filterParts.Add($"עד תאריך: {FormatDate(to.Value)}");

        var subtitle = filterParts.Count > 0 ? string.Join(" | ", filterParts) : null;

        return new WarehouseReportPdfModel(
            TenantPdfLetterheadBuilder.Build(tenant, logoAbsolutePath),
            "דוח תנועות מלאי",
            "דוח תנועות מלאי",
            DateTime.UtcNow,
            subtitle,
            WarehouseReportKind.Movements,
            [],
            groups);
    }

    private static string? BuildWarehouseFilterSubtitle(string? warehouseFilterName) =>
        string.IsNullOrWhiteSpace(warehouseFilterName) ? "כל המחסנים" : $"מחסן: {WarehouseDisplayName(warehouseFilterName)}";

    private static string WarehouseDisplayName(string name) => name switch
    {
        WarehouseService.ComponentsWarehouseName => "מחסן רכיבים",
        WarehouseService.FinishedGoodsWarehouseName => "מחסן מוצרים גמורים",
        _ => name
    };

    private static string ProductTypeLabel(string productType) => productType switch
    {
        nameof(ProductType.ComponentPart) => "רכיב",
        nameof(ProductType.FinishedGood) => "מוצר גמור",
        nameof(ProductType.Bundle) => "חבילה",
        nameof(ProductType.Spare) => "חלק חילוף",
        nameof(ProductType.Service) => "שירות",
        nameof(ProductType.Charge) => "חיוב",
        _ => productType
    };

    private static string MovementTypeLabel(string movementType) => movementType switch
    {
        nameof(StockMovementType.Receipt) => "קבלה",
        nameof(StockMovementType.Issue) => "הוצאה",
        nameof(StockMovementType.Adjustment) => "התאמה",
        _ => movementType
    };

    private static string FormatDate(DateTime utc) =>
        utc.ToLocalTime().ToString("dd/MM/yyyy", System.Globalization.CultureInfo.InvariantCulture);
}
