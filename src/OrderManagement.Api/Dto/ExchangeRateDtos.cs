namespace OrderManagement.Api.Dto;

public record UsdIlsRateDto(
    decimal Rate,
    DateTime RateDate,
    DateTime RequestedDate,
    bool UsedNearestAvailableDate,
    string Source);
