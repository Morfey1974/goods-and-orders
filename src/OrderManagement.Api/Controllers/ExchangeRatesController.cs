using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Services;

namespace OrderManagement.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/exchange-rates")]
public class ExchangeRatesController(ExchangeRateService exchangeRates) : ControllerBase
{
    [HttpGet("usd-ils")]
    public async Task<ActionResult<UsdIlsRateDto>> GetUsdIls([FromQuery] DateTime date, CancellationToken ct)
    {
        try
        {
            var result = await exchangeRates.GetUsdIlsAsync(date, ct);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
