using System.ComponentModel.DataAnnotations;

namespace OrderManagement.Api.Dto;

public record RegisterRequest(
    [Required][EmailAddress] string Email,
    [Required][MinLength(8)] string Password,
    [Required][MinLength(1)] string BusinessName,
    [Required][MinLength(1)] string OwnerFullName,
    string DefaultLanguage = "he");

public record LoginRequest(
    [Required][EmailAddress] string Email,
    [Required] string Password);

public record AuthResponse(
    string Token,
    Guid TenantId,
    Guid UserId,
    string Email,
    string BusinessName,
    string DefaultLanguage,
    DateTime TrialEndsAt,
    string SubscriptionStatus);
