using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace UrlShortener.Shared.Auth;

public static class TrustedProxyExtensions
{
    public static IServiceCollection AddTrustedProxies(this IServiceCollection services, IConfiguration config)
    {
        // Disable the implicit startup-filter middleware: otherwise it could consume
        // another ForwardLimit hops before our explicitly ordered middleware runs.
        config["ForwardedHeaders_Enabled"] = "false";
        var proxies = (config["Proxy:KnownProxies"] ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(value => IPAddress.TryParse(value, out var ip) ? ip
                : throw new InvalidOperationException("Proxy:KnownProxies must contain IP addresses")).ToArray();
        var limit = config.GetValue("Proxy:ForwardLimit", 1);
        if (limit is < 1 or > 10) throw new InvalidOperationException("Proxy:ForwardLimit must be between 1 and 10");
        // PostConfigure overrides the permissive ASPNETCORE_FORWARDEDHEADERS_ENABLED shortcut too.
        services.PostConfigure<ForwardedHeadersOptions>(options =>
        {
            options.KnownProxies.Clear();
            options.KnownIPNetworks.Clear();
            foreach (var proxy in proxies) options.KnownProxies.Add(proxy);
            options.ForwardLimit = limit;
            options.RequireHeaderSymmetry = true;
            options.ForwardedHeaders = proxies.Length == 0 ? ForwardedHeaders.None
                : ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        });
        return services;
    }
}
