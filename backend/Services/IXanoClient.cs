using FrontPR.Api.Models;

namespace FrontPR.Api.Services;

public interface IXanoClient
{
    Task StoreScanAsync(ScanInput scan);
}
