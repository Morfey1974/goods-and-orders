using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Extensions;
using OrderManagement.Api.Services;

namespace OrderManagement.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/document-sequences")]
public class DocumentSequencesController(DocumentNumberService numbers) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<DocumentSequenceDto>>> List(CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        var items = new List<DocumentSequenceDto>();
        foreach (var kind in DocumentNumberService.AllKinds)
        {
            var next = await numbers.GetNextNumberAsync(tenantId.Value, kind, ct);
            var maxUsed = await numbers.GetMaxUsedNumberAsync(tenantId.Value, kind, ct);
            items.Add(new DocumentSequenceDto(
                kind.ToString(),
                LabelKeyFor(kind),
                next,
                maxUsed,
                DocumentNumberService.Format(next)));
        }

        return Ok(items);
    }

    [HttpPut]
    public async Task<ActionResult<IEnumerable<DocumentSequenceDto>>> Update(
        [FromBody] UpdateDocumentSequencesRequest request,
        CancellationToken ct)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null) return Unauthorized();

        foreach (var item in request.Items)
        {
            if (!Enum.TryParse<DocumentSequenceKind>(item.Kind, true, out var kind))
                return BadRequest(new { message = $"Unknown sequence kind: {item.Kind}" });

            var maxUsed = await numbers.GetMaxUsedNumberAsync(tenantId.Value, kind, ct);
            if (maxUsed is { } max && item.NextNumber <= max)
            {
                return BadRequest(new
                {
                    message = $"Next number for {item.Kind} must be greater than the highest used number ({max}).",
                });
            }

            await numbers.SetNextNumberAsync(tenantId.Value, kind, item.NextNumber, ct);
        }

        return await List(ct);
    }

    private static string LabelKeyFor(DocumentSequenceKind kind) => kind switch
    {
        DocumentSequenceKind.Quote => "Quote",
        DocumentSequenceKind.Order => "Order",
        DocumentSequenceKind.ChargeInvoice => "ChargeInvoice",
        DocumentSequenceKind.Receipt => "Receipt",
        _ => kind.ToString(),
    };
}
