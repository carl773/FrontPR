using FrontPR.Api.Models;

namespace FrontPR.Api.Services;

// Placeholder until real Xano integration is built
public class NoOpXanoClient : IXanoClient
{
    public Task StoreScanAsync(ScanInput scan) => Task.CompletedTask;
}
