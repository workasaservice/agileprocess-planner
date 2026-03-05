# Seed Data

This directory contains JSON seed data files used for initial database population.

## Files

- **users.json** - User accounts (migrated to `config_users` table)
- **roles.json** - User roles and definitions (migrated to `config_roles` table)
- **capacity.json** - User capacity records (migrated to `config_capacity` table)
- **projects.json** - Project configurations (migrated to `config_projects` table)
- **users.credentials.json** - User credentials (migrated to `config_credentials` table)

## Migration

These files are used by the migration script to populate the Neon Postgres database:

```bash
npm run cli migrate-data -- --mode load
```

## When to Use

- **Initial setup:** Run migration once to populate the database
- **Database reset:** Re-run migration to restore from seed data
- **Testing:** Use as reference data for development

## Persistence Mode

After migration, the application uses the database when `PERSISTENCE_MODE=postgres`:

```bash
# Use database (recommended for production)
PERSISTENCE_MODE=postgres npm run cli <command>

# Use JSON files (legacy mode)
PERSISTENCE_MODE=json npm run cli <command>
```

## Notes

- These files are **source data only** when using Postgres persistence
- Changes to these files require re-running the migration
- Live data is managed in the Neon database via `configWriter`
