using FrontPR.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddHealthChecks();
builder.Services.AddSingleton<IXanoClient, NoOpXanoClient>();

// Support PORT env var for cloud hosts (Railway, Render, etc.)
// ASPNETCORE_URLS takes precedence when set by the platform (Azure App Service).
var port = Environment.GetEnvironmentVariable("PORT");
if (port is not null)
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

var app = builder.Build();

app.MapHealthChecks("/health");
app.MapControllers();

app.Run();
