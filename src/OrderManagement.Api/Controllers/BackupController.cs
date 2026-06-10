using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Extensions;
using OrderManagement.Api.Services;

namespace OrderManagement.Api.Controllers;

[ApiController]
[Route("api/backup")]
[Authorize]
public class BackupController(BackupService backupService) : ControllerBase
{
    [HttpGet("settings")]
    public async Task<ActionResult<BackupSettingsDto>> GetSettings(CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var settings = await backupService.GetSettingsAsync(tenantId.Value, ct);
        if (settings is null) return NotFound();
        return Ok(settings);
    }

    [HttpPut("settings")]
    public async Task<ActionResult<BackupSettingsDto>> UpdateSettings(
        [FromBody] UpdateBackupSettingsRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        try
        {
            var settings = await backupService.UpdateSettingsAsync(tenantId.Value, request, ct);
            if (settings is null) return NotFound();
            return Ok(settings);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("run")]
    public async Task<ActionResult<RunBackupResultDto>> RunBackup(CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var result = await backupService.RunBackupAsync(tenantId.Value, ct);
        return Ok(result);
    }
}
