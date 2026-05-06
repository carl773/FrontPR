using FrontPR.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSingleton<IXanoClient, NoOpXanoClient>();

var app = builder.Build();

app.MapControllers();

app.Run();
