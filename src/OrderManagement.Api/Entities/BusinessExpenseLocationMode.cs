namespace OrderManagement.Api.Entities;

/// <summary>How business premises expenses are recognized for עוסק פטור.</summary>
public enum BusinessExpenseLocationMode
{
    /// <summary>Rented office — rent and direct expenses at 100%.</summary>
    RentedOffice = 0,
    /// <summary>Home office — mixed home expenses by room share.</summary>
    HomeOffice = 1,
}
