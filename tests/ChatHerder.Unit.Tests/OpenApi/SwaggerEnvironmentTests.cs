using ChatHerder.API.OpenApi;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace ChatHerder.Unit.Tests.OpenApi;

public sealed class SwaggerEnvironmentTests
{
    [Theory]
    [InlineData("Development")]
    [InlineData("QA")]
    [InlineData("qa")]
    [InlineData("Staging")]
    [InlineData("staging")]
    public void IsSwaggerEnabledEnvironment_AllowsNonProductionApiDocumentation(string environmentName)
    {
        var environment = new TestHostEnvironment(environmentName);

        Assert.True(environment.IsSwaggerEnabledEnvironment());
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Local")]
    [InlineData("Demo")]
    public void IsSwaggerEnabledEnvironment_BlocksOtherEnvironments(string environmentName)
    {
        var environment = new TestHostEnvironment(environmentName);

        Assert.False(environment.IsSwaggerEnabledEnvironment());
    }

    private sealed class TestHostEnvironment(string environmentName) : IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "ChatHerder.API";
        public string WebRootPath { get; set; } = string.Empty;
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = string.Empty;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
