namespace OrderManagement.Api.Entities;

/// <summary>Direct operating expense (100% recognized for עוסק פטור).</summary>
public enum OperatingExpenseType
{
    Accountant = 0,
    OfficeSupplies = 1,
    Advertising = 2,
    BankFees = 3,
    Insurance = 4,
    ProfessionalServices = 5,
    SoftwareSubscription = 6,
    Rent = 7,
    Other = 8,
    Materials = 9,
    Logistics = 10,
}
