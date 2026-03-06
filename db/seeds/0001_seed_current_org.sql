INSERT INTO organizations (name, slug, settings)
VALUES ('workasaservice', 'workasaservice', '{"seeded": true}'::jsonb)
ON CONFLICT (slug) DO UPDATE
SET updated_at = NOW();

INSERT INTO projects (organization_id, name, key, settings)
SELECT o.id, 'MotherOps-Alpha', 'motherops-alpha', '{"enabled": true}'::jsonb
FROM organizations o
WHERE o.slug = 'workasaservice'
ON CONFLICT (organization_id, key) DO UPDATE
SET updated_at = NOW();

INSERT INTO projects (organization_id, name, key, settings)
SELECT o.id, 'MotherOps-Beta', 'motherops-beta', '{"enabled": true}'::jsonb
FROM organizations o
WHERE o.slug = 'workasaservice'
ON CONFLICT (organization_id, key) DO UPDATE
SET updated_at = NOW();

INSERT INTO teams (organization_id, project_id, name, key, settings)
SELECT o.id, p.id, 'MotherOps-Alpha Team', 'motherops-alpha-team', '{"seeded": true}'::jsonb
FROM organizations o
JOIN projects p ON p.organization_id = o.id
WHERE o.slug = 'workasaservice' AND p.key = 'motherops-alpha'
ON CONFLICT (project_id, key) DO UPDATE
SET updated_at = NOW();

INSERT INTO teams (organization_id, project_id, name, key, settings)
SELECT o.id, p.id, 'MotherOps-Beta Team', 'motherops-beta-team', '{"seeded": true}'::jsonb
FROM organizations o
JOIN projects p ON p.organization_id = o.id
WHERE o.slug = 'workasaservice' AND p.key = 'motherops-beta'
ON CONFLICT (project_id, key) DO UPDATE
SET updated_at = NOW();
