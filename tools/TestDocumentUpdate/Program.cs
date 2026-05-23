using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

var secret = "DEV_ONLY_CHANGE_IN_PRODUCTION_MIN_32_CHARACTERS_LONG";
var tenantId = "4fc0b56c-afbe-4ceb-97a2-a529f89b7ecc";
var userId = "69d73b3b-58c1-41df-9ad5-a0b75a400bf9";
var docId = "d8e78644-ac41-4252-b279-ccd1cb6015de";

var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
var token = new JwtSecurityToken(
    "OrderManagement",
    "OrderManagement",
    [
        new Claim(ClaimTypes.NameIdentifier, userId),
        new Claim(ClaimTypes.Email, "ed-group@inbox.ru"),
        new Claim("tenant_id", tenantId),
    ],
    expires: DateTime.UtcNow.AddHours(1),
    signingCredentials: creds);
var jwt = new JwtSecurityTokenHandler().WriteToken(token);

using var http = new HttpClient { BaseAddress = new Uri("http://localhost:8080") };
http.DefaultRequestHeaders.Authorization =
    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", jwt);

var body = new
{
    description = "test update",
    issueDate = "2026-05-23T12:00:00Z",
    version = 1,
    lines = new[]
    {
        new
        {
            productId = "1fa3844c-8d4f-4dcc-8e66-03b41de198dc",
            description = "Замок",
            quantity = 1,
            unitPrice = 5000m,
        },
        new
        {
            productId = "235ae906-8bec-478d-8372-6868adb48607",
            description = "Замоки",
            quantity = 2,
            unitPrice = 5000m,
        },
    },
};

var res = await http.PutAsJsonAsync($"/api/documents/{docId}", body);
var text = await res.Content.ReadAsStringAsync();
Console.WriteLine((int)res.StatusCode);
Console.WriteLine(text);
