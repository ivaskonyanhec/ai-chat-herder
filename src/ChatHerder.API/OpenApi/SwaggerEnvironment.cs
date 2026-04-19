namespace ChatHerder.API.OpenApi;

internal static class SwaggerEnvironment
{
    private const string QaEnvironmentName = "QA";

    public static bool IsSwaggerEnabledEnvironment(this IWebHostEnvironment environment)
    {
        return environment.IsDevelopment() ||
               environment.IsEnvironment(QaEnvironmentName) ||
               environment.IsStaging();
    }
}