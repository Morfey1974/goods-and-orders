namespace OrderManagement.Api.Entities;

/// <summary>Home mixed expense (הוצאות מעורבות — בית) for עוסק פטור.</summary>
public enum HomeExpenseType
{
    Electricity = 0,
    Arnona = 1,
    Water = 2,
    VaadBayit = 3,
    PhoneInternet = 4,
    MortgageInterest = 5,
    Cleaning = 6,
    Other = 7,
}
