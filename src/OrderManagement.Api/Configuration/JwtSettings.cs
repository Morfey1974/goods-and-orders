namespace OrderManagement.Api.Configuration;

public class JwtSettings
{
    public const string SectionName = "Jwt";
    public string Secret { get; set; } = "CHANGE_ME_TO_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARS";
    public string Issuer { get; set; } = "OrderManagement";
    public string Audience { get; set; } = "OrderManagement";
    public int ExpirationHours { get; set; } = 72;
}
