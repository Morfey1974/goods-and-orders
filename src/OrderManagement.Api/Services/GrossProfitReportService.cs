using OrderManagement.Api.Dto;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

public class GrossProfitReportService(IncomeReportService incomeReport, CogsReportService cogsReport)
{
    public async Task<GrossProfitReportDto> BuildAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct) =>
        await BuildAsync(tenantId, from, to, PlCogsMethod.CashBasis, ct);

    public async Task<GrossProfitReportDto> BuildAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        PlCogsMethod cogsMethod,
        CancellationToken ct)
    {
        var income = await incomeReport.BuildAsync(tenantId, from, to, ct);
        var revenue = income.GrandTotalIls;
        var cogsIls = await ResolveCogsIlsAsync(tenantId, from, to, cogsMethod, ct);

        return new GrossProfitReportDto(
            from?.Date,
            to?.Date,
            revenue,
            cogsIls,
            Math.Round(revenue - cogsIls, 2),
            income.ReceiptCount);
    }

    internal async Task<decimal> ResolveCogsIlsAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        PlCogsMethod cogsMethod,
        CancellationToken ct)
    {
        return cogsMethod switch
        {
            PlCogsMethod.InventoryFormula => (await cogsReport.BuildAsync(tenantId, from, to, ct)).CogsByFormulaIls,
            PlCogsMethod.IssueWriteOffs => (await cogsReport.BuildAsync(tenantId, from, to, ct)).CogsFromIssuesIls,
            _ => await cogsReport.SumCashBasisCogsIlsAsync(tenantId, from, to, ct)
        };
    }
}
