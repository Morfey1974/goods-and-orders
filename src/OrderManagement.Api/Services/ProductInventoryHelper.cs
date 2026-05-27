using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services;

public static class ProductInventoryHelper
{
    public static bool TracksStock(Product product) =>
        product.TrackInventory && ProductTypePrefixes.TracksStock(product.ProductType);
}
