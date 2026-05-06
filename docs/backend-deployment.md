# Backend Deployment Guide

This document covers how to deploy the FrontPR .NET backend to a cloud host.

The backend is a standard ASP.NET Core 9 Web API. It can be deployed to any host that supports .NET 9 — Azure App Service is the primary target.

---

## Azure App Service (recommended)

### Prerequisites

- Azure CLI installed and authenticated (`az login`)
- An Azure subscription
- A resource group (or create one below)

### 1. Create the App Service resources

```bash
# Variables — change these to match your setup
RESOURCE_GROUP=frontpr-rg
LOCATION=eastus
PLAN_NAME=frontpr-plan
APP_NAME=frontpr-backend   # must be globally unique

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create an App Service Plan (B1 = cheapest paid tier; F1 = free tier)
az appservice plan create \
  --name $PLAN_NAME \
  --resource-group $RESOURCE_GROUP \
  --sku B1 \
  --is-linux

# Create the Web App (runtime must match the project's TargetFramework)
az webapp create \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --plan $PLAN_NAME \
  --runtime "DOTNETCORE:9.0"
```

### 2. Set required application settings

Azure App Service automatically sets `ASPNETCORE_URLS` — no manual port configuration is needed.

Set `ASPNETCORE_ENVIRONMENT` so the app runs in production mode:

```bash
az webapp config appsettings set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings ASPNETCORE_ENVIRONMENT=Production
```

Do not add real Xano API keys, database connection strings, or secrets until the Xano integration is approved and ready.

### 3. Deploy via ZIP deploy

Build a release artifact and deploy it:

```bash
cd backend
dotnet publish -c Release -o ./publish

cd publish
zip -r ../deploy.zip .
cd ..

az webapp deploy \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --src-path deploy.zip
```

### 4. Verify the deployment

```bash
APP_URL=https://$APP_NAME.azurewebsites.net

curl $APP_URL/health
# Expected: Healthy

curl -s -X POST $APP_URL/api/scans/ingest \
  -H "Content-Type: application/json" \
  -d '{"targetUrl":"https://example.com","scannerVersion":"0.1.0","findings":[]}'
```

---

## GitHub Actions (CI/CD)

A GitHub Actions workflow can automate deployment on every push to `main`. This should be wired up once the team is ready to automate releases.

Key steps in a deployment workflow:
1. `dotnet publish -c Release -o ./publish`
2. Authenticate with Azure (`azure/login` action using a service principal secret)
3. Deploy using `azure/webapps-deploy` action

Store the Azure service principal credentials as a GitHub Actions secret (e.g. `AZURE_CREDENTIALS`). Never commit them to the repo.

---

## Alternative Hosts

The backend is a plain ASP.NET Core app and can run on any Linux host that supports .NET 9.

### Railway / Render / Fly.io

These platforms set a `PORT` environment variable. The backend reads `PORT` automatically if `ASPNETCORE_URLS` is not set:

```
PORT=8080 dotnet run
```

No code changes are needed — the `PORT` binding is already in `Program.cs`.

### Docker

A Dockerfile can be added later. The typical pattern:

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
WORKDIR /app

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "FrontPR.Api.dll"]
```

---

## What is NOT in scope yet

- Real Xano API integration (placeholder `NoOpXanoClient` is used)
- GitHub PR check posting
- Authentication / API key validation
- AI fix suggestions

These will be added in later milestones. Do not add secrets or integrate external services before each milestone is approved.
