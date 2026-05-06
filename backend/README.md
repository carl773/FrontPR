# FrontPR Backend

ASP.NET Core 9 API that receives scanner output, validates it, and returns a pass/fail result.

## Local Development

**Prerequisites:** .NET 9 SDK (included in the Dev Container)

```bash
cd backend
dotnet restore
dotnet build
dotnet run
```

The API listens on `http://localhost:5000` by default.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check — returns `Healthy` |
| POST | `/api/scans/ingest` | Receive scanner output, return pass/fail |

### Test the health endpoint

```bash
curl http://localhost:5000/health
```

### Test scan ingestion

```bash
curl -s -X POST http://localhost:5000/api/scans/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-project",
    "repository": "owner/repo",
    "commitSha": "abc123",
    "pullRequestNumber": 1,
    "scannerVersion": "0.1.0",
    "targetUrl": "https://example.com",
    "findings": []
  }'
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port to bind when running on cloud hosts (Railway, Render) | — |
| `ASPNETCORE_URLS` | Full URL(s) to bind — set automatically by Azure App Service | `http://localhost:5000` |
| `ASPNETCORE_ENVIRONMENT` | `Development` or `Production` | `Production` |

Azure App Service sets `ASPNETCORE_URLS` automatically. No extra configuration is needed for port binding on that platform.

## Running Tests

```bash
cd backend
dotnet test
```

## Deployment

See [`docs/backend-deployment.md`](../docs/backend-deployment.md) for deployment instructions.
