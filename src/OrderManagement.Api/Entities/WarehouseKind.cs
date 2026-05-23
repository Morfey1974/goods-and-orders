namespace OrderManagement.Api.Entities;

/// <summary>
/// System: CP/SP → Components; FG/BD → FinishedGoods. Custom — user-defined warehouses.
/// </summary>
public enum WarehouseKind
{
    Components = 0,
    FinishedGoods = 1,
    Custom = 2
}

public static class WarehouseKindExtensions
{
    public static bool IsSystem(this WarehouseKind kind) =>
        kind is WarehouseKind.Components or WarehouseKind.FinishedGoods;
}
