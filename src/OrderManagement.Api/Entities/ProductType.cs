namespace OrderManagement.Api.Entities;

public enum ProductType
{
    ComponentPart = 0,   // CP
    FinishedGood = 1,    // FG
    Service = 2,         // SV
    Charge = 3,          // CH
    Bundle = 4,          // BD
    Spare = 5,           // SP
    FixedAsset = 6,      // FA
    Consumable = 7,      // CM
}

public static class ProductTypePrefixes
{
    public static string GetPrefix(ProductType type) => type switch
    {
        ProductType.ComponentPart => "CP",
        ProductType.FinishedGood => "FG",
        ProductType.Service => "SV",
        ProductType.Charge => "CH",
        ProductType.Bundle => "BD",
        ProductType.Spare => "SP",
        ProductType.FixedAsset => "FA",
        ProductType.Consumable => "CM",
        _ => "FG"
    };

    public static bool TracksStock(ProductType type) =>
        type is ProductType.ComponentPart or ProductType.FinishedGood or ProductType.Bundle or ProductType.Spare;

    public static bool IsFixedAsset(ProductType type) => type == ProductType.FixedAsset;

    public static bool IsConsumable(ProductType type) => type == ProductType.Consumable;

    public static WarehouseKind GetWarehouseKind(ProductType type) =>
        type is ProductType.FinishedGood or ProductType.Bundle
            ? WarehouseKind.FinishedGoods
            : WarehouseKind.Components;
}
