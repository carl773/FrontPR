using System.Security.Cryptography;
using System.Text;
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
        var configuredToken = Environment.GetEnvironmentVariable("FRONTPR_API_TOKEN");

        if (!string.IsNullOrEmpty(configuredToken))
        {
            var authHeader = Request.Headers.Authorization.FirstOrDefault();
            var providedToken = authHeader?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) == true
                ? authHeader["Bearer ".Length..].Trim()
                : null;

            var tokenValid = !string.IsNullOrEmpty(providedToken) &&
                CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(providedToken),
                    Encoding.UTF8.GetBytes(configuredToken));

            if (!tokenValid)
                return Unauthorized(new { error = "Invalid or missing API token" });
        }
        else
        {
            Console.WriteLine("[FrontPR] Warning: FRONTPR_API_TOKEN is not set. Running in unauthenticated dev mode.");
        }

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
