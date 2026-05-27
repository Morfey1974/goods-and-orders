using System.ComponentModel.DataAnnotations;

namespace OrderManagement.Api.Dto;

public record ProductGroupDto(
    Guid Id,
    string Name,
    int SortOrder,
    IReadOnlyList<Guid> ProductIds);

public record CreateProductGroupRequest(
    [Required][MinLength(1)][MaxLength(128)] string Name);

public record UpdateProductGroupRequest(
    [Required][MinLength(1)][MaxLength(128)] string Name,
    int SortOrder);

public record SetProductGroupMembersRequest(
    [Required] IReadOnlyList<Guid> ProductIds);
