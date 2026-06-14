using System.ComponentModel.DataAnnotations;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Dto;

public record BusinessExpenseDocumentDto(
    Guid Id,
    string FileName,
    string ContentType,
    int SortOrder,
    DateTime CreatedAt);

public record BusinessExpenseDto(
    Guid Id,
    DateTime ExpenseDate,
    bool IsHomeMixed,
    string? HomeExpenseType,
    string? OperatingExpenseType,
    decimal AmountIls,
    decimal RecognizedPercent,
    decimal RecognizedAmountIls,
    string? VendorName,
    string? InvoiceReference,
    string? Notes,
    int DocumentCount,
    DateTime CreatedAt,
    IReadOnlyList<BusinessExpenseDocumentDto>? Documents = null);

public record CreateBusinessExpenseRequest(
    [Required] DateTime ExpenseDate,
    bool IsHomeMixed,
    string? HomeExpenseType,
    string? OperatingExpenseType,
    [Range(0.01, double.MaxValue)] decimal AmountIls,
    string? VendorName,
    string? InvoiceReference,
    string? Notes);

public record UpdateBusinessExpenseRequest(
    [Required] DateTime ExpenseDate,
    bool IsHomeMixed,
    string? HomeExpenseType,
    string? OperatingExpenseType,
    [Range(0.01, double.MaxValue)] decimal AmountIls,
    string? VendorName,
    string? InvoiceReference,
    string? Notes);

public record FixedAssetDocumentDto(
    Guid Id,
    string FileName,
    string ContentType,
    int SortOrder,
    DateTime CreatedAt);

public record FixedAssetDto(
    Guid Id,
    string Name,
    string? Description,
    DateTime PurchaseDate,
    decimal CostIls,
    string Category,
    decimal AnnualDepreciationPercent,
    decimal AnnualDepreciationIls,
    string? VendorName,
    string? InvoiceReference,
    string? Notes,
    bool IsDisposed,
    DateTime? DisposedAt,
    int DocumentCount,
    DateTime CreatedAt,
    IReadOnlyList<FixedAssetDocumentDto>? Documents = null);

public record CreateFixedAssetRequest(
    [Required][MinLength(1)] string Name,
    string? Description,
    [Required] DateTime PurchaseDate,
    [Range(0.01, double.MaxValue)] decimal CostIls,
    [Required] string Category,
    string? VendorName,
    string? InvoiceReference,
    string? Notes);

public record UpdateFixedAssetRequest(
    [Required][MinLength(1)] string Name,
    string? Description,
    [Required] DateTime PurchaseDate,
    [Range(0.01, double.MaxValue)] decimal CostIls,
    [Required] string Category,
    string? VendorName,
    string? InvoiceReference,
    string? Notes,
    bool IsDisposed);

public record OperatingExpensesReportDto(
    DateTime? From,
    DateTime? To,
    decimal HomeMixedTotalIls,
    decimal HomeMixedRecognizedIls,
    decimal OperatingDirectTotalIls,
    decimal DepreciationIls,
    decimal GrandTotalRecognizedIls,
    IReadOnlyList<BusinessExpenseDto> ExpenseLines,
    IReadOnlyList<FixedAssetDepreciationLineDto> DepreciationLines);

public record FixedAssetDepreciationLineDto(
    Guid AssetId,
    string Name,
    string Category,
    decimal AnnualDepreciationIls,
    decimal PeriodDepreciationIls);

public record CogsReportDto(
    DateTime? From,
    DateTime? To,
    decimal OpeningInventoryIls,
    decimal PurchasesToInventoryIls,
    decimal ClosingInventoryIls,
    decimal CogsByFormulaIls,
    decimal CogsFromIssuesIls,
    IReadOnlyList<CogsIssueLineDto> IssueLines);

public record CogsIssueLineDto(
    Guid MovementId,
    DateTime MovementDate,
    string ArticleCode,
    string ProductName,
    decimal Quantity,
    decimal TotalCostIls,
    string? Notes);

public record GrossProfitReportDto(
    DateTime? From,
    DateTime? To,
    decimal RevenueIls,
    decimal CogsIls,
    decimal GrossProfitIls,
    int ReceiptCount);

public record OperatingExpenseCategoryLineDto(
    string Category,
    decimal AmountIls);

public record ProfitAndLossReportDto(
    DateTime? From,
    DateTime? To,
    string CogsMethod,
    decimal RevenueIls,
    decimal CogsIls,
    decimal GrossProfitIls,
    decimal HomeMixedRecognizedIls,
    decimal OperatingDirectRecognizedIls,
    decimal DepreciationIls,
    decimal TotalRecognizedExpensesIls,
    decimal NetProfitIls,
    IReadOnlyList<OperatingExpenseCategoryLineDto> OperatingByCategory);

public record VendorServiceLineDto(
    DateTime ServiceDate,
    string SourceKind,
    string? ReceiptNumber,
    string VendorName,
    string Category,
    string? Description,
    decimal AmountIls);

public record VendorServicesReportDto(
    DateTime? From,
    DateTime? To,
    IReadOnlyList<VendorServiceLineDto> Lines,
    decimal GrandTotalIls);

public static class BusinessExpenseMappers
{
    public static (int Used, int Total) ResolveHomeRooms(Tenant tenant)
    {
        var total = tenant.HomeBusinessRoomsTotal > 0 ? tenant.HomeBusinessRoomsTotal : 4;
        var used = tenant.HomeBusinessRoomsUsed > 0 ? tenant.HomeBusinessRoomsUsed : 1;
        if (used > total) used = total;
        return (used, total);
    }

    public static decimal ResolveHomeRecognizedPercent(Tenant tenant)
    {
        var (used, total) = ResolveHomeRooms(tenant);
        return Math.Round(100m * used / total, 2);
    }

    public static bool UsesHomeOffice(Tenant tenant) =>
        tenant.ExpenseLocationMode == BusinessExpenseLocationMode.HomeOffice;

    public static decimal RecognizedAmount(decimal amountIls, bool isHomeMixed, Tenant tenant)
    {
        if (!isHomeMixed || !UsesHomeOffice(tenant))
            return Math.Round(amountIls, 2);
        return Math.Round(amountIls * ResolveHomeRecognizedPercent(tenant) / 100m, 2);
    }

    public static BusinessExpenseDocumentDto ToDocumentDto(BusinessExpenseDocument d) =>
        new(d.Id, d.FileName, d.ContentType, d.SortOrder, d.CreatedAt);

    public static FixedAssetDocumentDto ToFixedAssetDocumentDto(FixedAssetDocument d) =>
        new(d.Id, d.FileName, d.ContentType, d.SortOrder, d.CreatedAt);

    public static BusinessExpenseDto ToDto(
        BusinessExpense e,
        Tenant tenant,
        int documentCount = 0,
        IReadOnlyList<BusinessExpenseDocumentDto>? documents = null)
    {
        var pct = e.IsHomeMixed && UsesHomeOffice(tenant) ? ResolveHomeRecognizedPercent(tenant) : 100m;
        var notes = string.IsNullOrWhiteSpace(e.Notes) ? e.Description : e.Notes;
        return new BusinessExpenseDto(
            e.Id,
            e.ExpenseDate,
            e.IsHomeMixed,
            e.HomeExpenseType?.ToString(),
            e.OperatingExpenseType?.ToString(),
            e.AmountIls,
            pct,
            RecognizedAmount(e.AmountIls, e.IsHomeMixed, tenant),
            e.VendorName,
            e.InvoiceReference,
            notes,
            documentCount,
            e.CreatedAt,
            documents);
    }

    public static FixedAssetDto ToDto(
        FixedAsset a,
        int documentCount = 0,
        IReadOnlyList<FixedAssetDocumentDto>? documents = null)
    {
        var annual = Math.Round(a.CostIls * a.AnnualDepreciationPercent / 100m, 2);
        return new FixedAssetDto(
            a.Id,
            a.Name,
            a.Description,
            a.PurchaseDate,
            a.CostIls,
            a.Category.ToString(),
            a.AnnualDepreciationPercent,
            annual,
            a.VendorName,
            a.InvoiceReference,
            a.Notes,
            a.IsDisposed,
            a.DisposedAt,
            documentCount,
            a.CreatedAt,
            documents);
    }

    public static HomeExpenseType ParseHomeType(string? value) =>
        Enum.TryParse<HomeExpenseType>(value, true, out var t) ? t : HomeExpenseType.Other;

    public static OperatingExpenseType ParseOperatingType(string? value) =>
        Enum.TryParse<OperatingExpenseType>(value, true, out var t) ? t : OperatingExpenseType.Other;

    public static DepreciationAssetCategory ParseDepreciationCategory(string value) =>
        Enum.TryParse<DepreciationAssetCategory>(value, true, out var c)
            ? c
            : DepreciationAssetCategory.OtherEquipment;
}
