namespace FrontPR.Api.Models;

public record Finding(
    string Category,
    string Severity,
    string RuleId,
    string Title,
    string Description,
    string? FilePath,
    int? LineNumber,
    string? Fingerprint,
    object? RawPayload
);

public record ScanInput(
    string? ProjectId,
    string? Repository,
    string? CommitSha,
    int? PullRequestNumber,
    string? ScannerVersion,
    string? TargetUrl,
    List<Finding>? Findings
);
