namespace OrderManagement.Api.Dto;

public record BackupSettingsDto(
    string? BackupHostPath,
    string EffectiveRootPath,
    string? HostMountHint,
    DateTime? LastBackupUtc,
    string? LastBackupFileName,
    long? LastBackupSizeBytes,
    string? LastBackupError);

public record UpdateBackupSettingsRequest(string? BackupHostPath);

public record RunBackupResultDto(
    bool Success,
    string? FileName,
    string? FullPath,
    long? SizeBytes,
    DateTime? CreatedUtc,
    string? Error);
