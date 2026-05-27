namespace OrderManagement.Api.Configuration;

public class AppSettings
{
    public const string SectionName = "App";

    public string FrontendBaseUrl { get; set; } = "http://localhost:5173";
}
