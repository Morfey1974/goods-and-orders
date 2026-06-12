using OrderManagement.Api.Dto;

namespace OrderManagement.Api.Services;

public class GrossProfitReportService(IncomeReportService incomeReport, CogsReportService cogsReport)
{
    public async Task<GrossProfitReportDto> BuildAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct)
    {
        var income = await incomeReport.BuildAsync(tenantId, from, to, ct);
        var revenue = income.GrandTotalIls;
        var cogsIls = await cogsReport.SumCashBasisCogsIlsAsync(tenantId, from, to, ct);

        return new GrossProfitReportDto(
            from?.Date,
            to?.Date,
            revenue,
            cogsIls,
            Math.Round(revenue - cogsIls, 2),
            income.ReceiptCount);
    }
}
