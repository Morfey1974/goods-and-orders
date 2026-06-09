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
public class FinancialReportsController(IncomeReportService incomeReport) : ControllerBase
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
}
