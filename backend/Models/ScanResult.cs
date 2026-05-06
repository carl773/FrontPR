namespace FrontPR.Api.Models;

public record ScanResult(
    string Status,
    int FindingCount,
    string Message
);
