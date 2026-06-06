namespace OrderManagement.Api.Dto;

public record DocumentSequenceDto(
    string Kind,
    string LabelKey,
    int NextNumber,
    int? MaxUsedNumber,
    string Preview);

public record UpdateDocumentSequencesRequest(
    IReadOnlyList<UpdateDocumentSequenceItem> Items);

public record UpdateDocumentSequenceItem(
    string Kind,
    int NextNumber);

public record DocumentImportResultDto(
    int Imported,
    int Skipped,
    int Linked,
    IReadOnlyList<DocumentImportErrorDto> Errors);

public record DocumentImportErrorDto(int Line, string Message);
