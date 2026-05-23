using Microsoft.Extensions.Options;
using OrderManagement.Api.Configuration;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public class SubscriptionService(IOptions<SubscriptionSettings> options)
{
    private readonly SubscriptionSettings _settings = options.Value;

    public bool IsWriteAllowed(Tenant tenant)
    {
        if (!_settings.EnforcementEnabled)
            return true;

        RefreshSubscriptionStatus(tenant);

        return tenant.SubscriptionStatus is SubscriptionStatus.Trial or SubscriptionStatus.Active;
    }

    public void RefreshSubscriptionStatus(Tenant tenant)
    {
        if (tenant.SubscriptionStatus == SubscriptionStatus.Active &&
            tenant.SubscriptionPaidUntil.HasValue &&
            tenant.SubscriptionPaidUntil.Value > DateTime.UtcNow)
            return;

        if (tenant.SubscriptionStatus == SubscriptionStatus.Active &&
            tenant.SubscriptionPaidUntil.HasValue &&
            tenant.SubscriptionPaidUntil.Value <= DateTime.UtcNow)
        {
            tenant.SubscriptionStatus = SubscriptionStatus.Expired;
            return;
        }

        if (tenant.SubscriptionStatus == SubscriptionStatus.Trial &&
            DateTime.UtcNow > tenant.TrialEndsAt)
            tenant.SubscriptionStatus = SubscriptionStatus.Expired;
    }
}
