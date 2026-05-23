namespace OrderManagement.Api.Configuration;

public class SubscriptionSettings
{
    public const string SectionName = "Subscription";
    public bool EnforcementEnabled { get; set; }
    public int TrialDays { get; set; } = 30;
}
