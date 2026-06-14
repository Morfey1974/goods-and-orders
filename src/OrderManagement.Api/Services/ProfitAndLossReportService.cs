using Microsoft.EntityFrameworkCore;
using OrderManagement.Api.Data;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Helpers;

namespace OrderManagement.Api.Services;

public class ProfitAndLossReportService(
    GrossProfitReportService grossProfit,
    OperatingExpensesReportService operatingExpenses)
{
    public async Task<ProfitAndLossReportDto> BuildAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        CancellationToken ct) =>
        await BuildAsync(tenantId, from, to, PlCogsMethod.CashBasis, ct);

    public async Task<ProfitAndLossReportDto> BuildAsync(
        Guid tenantId,
        DateTime? from,
        DateTime? to,
        PlCogsMethod cogsMethod,
        CancellationToken ct)
    {
        var gp = await grossProfit.BuildAsync(tenantId, from, to, cogsMethod, ct);
        var opEx = await operatingExpenses.BuildAsync(tenantId, from, to, ct);

        var byCategory = opEx.ExpenseLines
            .Where(e => !e.IsHomeMixed && e.OperatingExpenseType is not null)
            .GroupBy(e => e.OperatingExpenseType!)
            .Select(g => new OperatingExpenseCategoryLineDto(
                g.Key,
                DepreciationCalculator.RoundMoney(g.Sum(e => e.RecognizedAmountIls))))
            .OrderBy(l => l.Category)
            .ToList();

        var totalRecognized = DepreciationCalculator.RoundMoney(
            opEx.HomeMixedRecognizedIls + opEx.OperatingDirectTotalIls + opEx.DepreciationIls);

        var netProfit = DepreciationCalculator.RoundMoney(gp.GrossProfitIls - totalRecognized);

        return new ProfitAndLossReportDto(
            from?.Date,
            to?.Date,
            cogsMethod.ToString(),
            gp.RevenueIls,
            gp.CogsIls,
            gp.GrossProfitIls,
            opEx.HomeMixedRecognizedIls,
            opEx.OperatingDirectTotalIls,
            opEx.DepreciationIls,
            totalRecognized,
            netProfit,
            byCategory);
    }
}
