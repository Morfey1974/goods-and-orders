namespace OrderManagement.Api.Entities;

/// <summary>Annual depreciation rate categories (פחת) per common עוסק פטור practice.</summary>
public enum DepreciationAssetCategory
{
    Furniture = 0,
    OtherEquipment = 1,
    AirConditioner = 2,
    ConstructionEquipment = 3,
    Vehicle = 4,
    PersonalPc = 5,
    OtherPc = 6,
    ProfessionalBooks = 7,
}

public static class DepreciationAssetCategoryRates
{
    public static decimal AnnualPercent(DepreciationAssetCategory category) =>
        category switch
        {
            DepreciationAssetCategory.Furniture => 6m,
            DepreciationAssetCategory.OtherEquipment => 7m,
            DepreciationAssetCategory.AirConditioner => 10m,
            DepreciationAssetCategory.ConstructionEquipment => 15m,
            DepreciationAssetCategory.Vehicle => 20m,
            DepreciationAssetCategory.PersonalPc => 100m / 3m,
            DepreciationAssetCategory.OtherPc => 25m,
            DepreciationAssetCategory.ProfessionalBooks => 25m,
            _ => 7m,
        };
}
