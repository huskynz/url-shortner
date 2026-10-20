<br/>
<p align="center">
  <a href="https://github.com/HuskyNZ/url-shortner">
    <img src="https://serv.hnz.li/logo/default.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">HuskyNZ's Url Shortner</h3>
  <br>

</p>

![Contributors](https://img.shields.io/github/contributors/HuskyNZ/url-shortner?color=dark-green) ![Issues](https://img.shields.io/github/issues/HuskyNZ/url-shortner) ![License](https://img.shields.io/github/license/HuskyNZ/url-shortner)

## About The Project

A URL shortener built on **.NET 10**, split into three deployable services (public
web, admin console, and API) backed by **PostgreSQL**. It provides short-path
redirects, a public link listing, a password-protected link flow, an admin panel with
analytics, and an API-key–authenticated JSON API.

| Project | Role |
| --- | --- |
| `UrlShortener.Public` | Blazor SSR — public site, `/{id}` redirects, link hub |
| `UrlShortener.Admin` | Blazor Interactive Server — admin console |
| `UrlShortener.Api` | ASP.NET Core Web API — `/api/*`, API-key auth |
| `UrlShortener.Shared` | EF Core data layer, services, auth, caching |

## Built With

- [.NET 10](https://dotnet.microsoft.com/) — ASP.NET Core + Blazor
- [Entity Framework Core](https://learn.microsoft.com/ef/core/) + [Npgsql](https://www.npgsql.org/)
- [PostgreSQL](https://www.postgresql.org/)
- [Tailwind CSS](https://tailwindcss.com/)

## How to run?

You need a PostgreSQL instance and the .NET 10 SDK. Point the services at your
database and run them — each applies the schema itself on startup (idempotent):

```bash
export ConnectionStrings__Postgres="Host=localhost;Port=5432;Database=urlshortener;Username=postgres;Password=postgres"

dotnet run --project src/UrlShortener.Public   # public site
dotnet run --project src/UrlShortener.Admin    # admin console
dotnet run --project src/UrlShortener.Api      # API
```

Route the root domain to `Public` — it owns the catch-all `/{id}` redirect — and give
`Admin` and `API` their own host or path.

## Configuration

Every setting is documented in [.env.example](.env.example). The ones you are most
likely to touch:

- `ConnectionStrings__Postgres` — database connection.
- `UrlShortener__{UrlsTable,AdminsTable,ApiKeysTable}` — table names.
- `UrlShortener__RedirectCacheTtlSeconds` — redirect cache TTL.
- `Auth__CookieDomain` + `DataProtection__KeyRingPath` — set both (shared parent
  domain and shared key ring) if you want the Admin session cookie to also
  authenticate the API. Otherwise the API is used via API keys
  (`X-API-Key` / `Authorization: Bearer <key>`).

## Roadmap

Improving Frondend 

## Contributing

Please reach out to mail@husky.nz with any feedback as this is just a public mirror

## License

A public mirror is provided and there is no guarantee it will build

## Authors

- [HuskyNZ](https://www.husky.nz)

## Acknowledgements
- [@not-my-username](https://github.com/not-my-username)
