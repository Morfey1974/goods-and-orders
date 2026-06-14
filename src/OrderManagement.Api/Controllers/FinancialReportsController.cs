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
    CogsReportService cogsReport,
    GrossProfitReportService grossProfitReport,
    OperatingExpensesReportService operatingExpensesReport,
    ProfitAndLossReportService profitAndLossReport,
    ProfitAndLossReportPdfService profitAndLossReportPdf,
    VendorServicesReportService vendorServicesReport,
    VendorServicesReportPdfService vendorServicesReportPdf,
    Form1342ReportService form1342Report,
    Form1342PdfService form1342Pdf,
    FinancialReportPdfService financialReportPdf,
    OperatingExpensesReportPdfService operatingExpensesReportPdf,
    CogsReportPdfService cogsReportPdf) : ControllerBase
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

    [HttpGet("cogs")]
    public async Task<ActionResult<CogsReportDto>> Cogs(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var validation = ReportDateRange.Validate(from, to);
        if (validation is not null)
            return BadRequest(new { message = validation });

        return Ok(await cogsReport.BuildAsync(tenantId.Value, from, to, ct));
    }

    [HttpGet("cogs/pdf")]
    public async Task<IActionResult> CogsPdf(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var validation = ReportDateRange.Validate(from, to);
        if (validation is not null)
            return BadRequest(new { message = validation });

        var pdf = await cogsReportPdf.GenerateAsync(tenantId.Value, from, to, ct);
        return File(pdf, "application/pdf", "cogs-report.pdf", enableRangeProcessing: true);
    }

    [HttpGet("gross-profit")]
    public async Task<ActionResult<GrossProfitReportDto>> GrossProfit(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var validation = ReportDateRange.Validate(from, to);
        if (validation is not null)
            return BadRequest(new { message = validation });

        return Ok(await grossProfitReport.BuildAsync(tenantId.Value, from, to, ct));
    }

    [HttpGet("operating-expenses")]
    public async Task<ActionResult<OperatingExpensesReportDto>> OperatingExpenses(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var validation = ReportDateRange.Validate(from, to);
        if (validation is not null)
            return BadRequest(new { message = validation });

        return Ok(await operatingExpensesReport.BuildAsync(tenantId.Value, from, to, ct));
    }

    [HttpGet("operating-expenses/pdf")]
    public async Task<IActionResult> OperatingExpensesPdf(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var validation = ReportDateRange.Validate(from, to);
        if (validation is not null)
            return BadRequest(new { message = validation });

        var pdf = await operatingExpensesReportPdf.GenerateAsync(tenantId.Value, from, to, ct);
        return File(pdf, "application/pdf", "operating-expenses-report.pdf", enableRangeProcessing: true);
    }

    [HttpGet("profit-and-loss")]
    public async Task<ActionResult<ProfitAndLossReportDto>> ProfitAndLoss(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string? cogsMethod,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var validation = ReportDateRange.Validate(from, to);
        if (validation is not null)
            return BadRequest(new { message = validation });

        var method = PlCogsMethodParser.Parse(cogsMethod);
        return Ok(await profitAndLossReport.BuildAsync(tenantId.Value, from, to, method, ct));
    }

    [HttpGet("profit-and-loss/pdf")]
    public async Task<IActionResult> ProfitAndLossPdf(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string? cogsMethod,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var validation = ReportDateRange.Validate(from, to);
        if (validation is not null)
            return BadRequest(new { message = validation });

        var method = PlCogsMethodParser.Parse(cogsMethod);
        var pdf = await profitAndLossReportPdf.GenerateAsync(tenantId.Value, from, to, method, ct);
        return File(pdf, "application/pdf", "profit-and-loss-report.pdf", enableRangeProcessing: true);
    }

    [HttpGet("vendor-services")]
    public async Task<ActionResult<VendorServicesReportDto>> VendorServices(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var validation = ReportDateRange.Validate(from, to);
        if (validation is not null)
            return BadRequest(new { message = validation });

        return Ok(await vendorServicesReport.BuildAsync(tenantId.Value, from, to, ct));
    }

    [HttpGet("vendor-services/pdf")]
    public async Task<IActionResult> VendorServicesPdf(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var validation = ReportDateRange.Validate(from, to);
        if (validation is not null)
            return BadRequest(new { message = validation });

        var pdf = await vendorServicesReportPdf.GenerateAsync(tenantId.Value, from, to, ct);
        return File(pdf, "application/pdf", "vendor-services-report.pdf", enableRangeProcessing: true);
    }

    [HttpGet("form-1342")]
    public async Task<ActionResult<Form1342ReportDto>> Form1342(
        [FromQuery] int taxYear,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();
        if (taxYear < 2000 || taxYear > 2100)
            return BadRequest(new { message = "Invalid tax year." });

        return Ok(await form1342Report.BuildAsync(tenantId.Value, taxYear, ct));
    }

    [HttpGet("form-1342/pdf")]
    public async Task<IActionResult> Form1342Pdf(
        [FromQuery] int taxYear,
        CancellationToken ct = default)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();
        if (taxYear < 2000 || taxYear > 2100)
            return BadRequest(new { message = "Invalid tax year." });

        var pdf = await form1342Pdf.GenerateAsync(tenantId.Value, taxYear, ct);
        return File(pdf, "application/pdf", $"form-1342-{taxYear}.pdf", enableRangeProcessing: true);
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
