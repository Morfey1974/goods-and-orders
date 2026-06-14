namespace OrderManagement.Api.Helpers;

public enum PlCogsMethod
{
    CashBasis,
    InventoryFormula,
    IssueWriteOffs
}

public static class PlCogsMethodParser
{
    public static PlCogsMethod Parse(string? value) =>
        Enum.TryParse<PlCogsMethod>(value, true, out var method) ? method : PlCogsMethod.CashBasis;
}
