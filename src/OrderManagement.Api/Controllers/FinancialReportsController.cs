using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Extensions;
using OrderManagement.Api.Helpers;
using OrderManagement.Api.Services;

namespace OrderManagement.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/reports")]
public class FinancialReportsController(
    IncomeReportService incomeReport,
    ExpenseReportService expenseReport,
    FinancialReportPdfService financialReportPdf) : ControllerBase
{
    [HttpGet("income")]
    public async Task<ActionResult<IncomeReportDto>> Income(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var validation = ReportDateRange.Validate(from, to);
        if (validation is not null)
            return BadRequest(new { message = validation });

        var report = await incomeReport.BuildAsync(tenantId.Value, from, to, ct);
        return Ok(report);
    }

    [HttpGet("expenses")]
    public async Task<ActionResult<ExpenseReportDto>> Expenses(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var validation = ReportDateRange.Validate(from, to);
        if (validation is not null)
            return BadRequest(new { message = validation });

        var report = await expenseReport.BuildAsync(tenantId.Value, from, to, ct);
        return Ok(report);
    }

    [HttpGet("income/pdf")]
    public async Task<IActionResult> IncomePdf(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var validation = ReportDateRange.Validate(from, to);
        if (validation is not null)
            return BadRequest(new { message = validation });

        var pdf = await financialReportPdf.GenerateIncomeAsync(tenantId.Value, from, to, ct);
        return File(pdf, "application/pdf", "income-report.pdf", enableRangeProcessing: true);
    }

    [HttpGet("expenses/pdf")]
    public async Task<IActionResult> ExpensesPdf(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var validation = ReportDateRange.Validate(from, to);
        if (validation is not null)
            return BadRequest(new { message = validation });

        var pdf = await financialReportPdf.GenerateExpenseAsync(tenantId.Value, from, to, ct);
        return File(pdf, "application/pdf", "expense-report.pdf", enableRangeProcessing: true);
    }
}
