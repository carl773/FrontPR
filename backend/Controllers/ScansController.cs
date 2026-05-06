using Microsoft.AspNetCore.Mvc;
using FrontPR.Api.Models;
using FrontPR.Api.Services;

namespace FrontPR.Api.Controllers;

[ApiController]
[Route("api/scans")]
public class ScansController(IXanoClient xano) : ControllerBase
{
    [HttpPost("ingest")]
    public async Task<IActionResult> Ingest([FromBody] ScanInput scan)
    {
        if (string.IsNullOrWhiteSpace(scan.TargetUrl))
            return BadRequest(new { error = "targetUrl is required" });

        if (string.IsNullOrWhiteSpace(scan.ScannerVersion))
            return BadRequest(new { error = "scannerVersion is required" });

        await xano.StoreScanAsync(scan);

        int findingCount = scan.Findings?.Count ?? 0;
        bool passed = findingCount == 0;

        return Ok(new ScanResult(
            Status: passed ? "pass" : "fail",
            FindingCount: findingCount,
            Message: passed
                ? "No findings. Scan passed."
                : $"{findingCount} finding(s) detected. Scan failed."
        ));
    }
}
