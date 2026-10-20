using DotNetEnv;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Inventory.Api;

public sealed class InventoryDbContextFactory : IDesignTimeDbContextFactory<InventoryDbContext>
{
    public InventoryDbContext CreateDbContext(string[] args)
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AZURE_SQL_CONNECTION_STRING")))
        {
            var directory = new DirectoryInfo(Directory.GetCurrentDirectory());
            while (directory is not null && !File.Exists(Path.Combine(directory.FullName, ".env")))
            {
                directory = directory.Parent;
            }
            if (directory is not null)
            {
                Env.Load(Path.Combine(directory.FullName, ".env"), new LoadOptions(clobberExistingVars: false));
            }
        }

        var connectionString = Environment.GetEnvironmentVariable("AZURE_SQL_CONNECTION_STRING");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("Set AZURE_SQL_CONNECTION_STRING before creating database migrations.");
        }

        var options = new DbContextOptionsBuilder<InventoryDbContext>()
            .UseSqlServer(connectionString, sqlServerOptions => sqlServerOptions.EnableRetryOnFailure())
            .Options;
        return new InventoryDbContext(options);
    }
}
