-- Runs once when the container's data directory is first initialized.

-- Extension needed for pg_stat_statements views (already preloaded via
-- shared_preload_libraries in postgresql.conf; this creates the SQL objects).
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Least-privilege role the collector connects as. See architecture doc
-- section 3 for the reasoning behind each grant.
CREATE ROLE query_guardian_reader LOGIN PASSWORD 'qg_reader_dev_password';
GRANT pg_read_all_stats TO query_guardian_reader;
GRANT CONNECT ON DATABASE appdb TO query_guardian_reader;
GRANT USAGE ON SCHEMA public TO query_guardian_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO query_guardian_reader; -- enables live EXPLAIN; see docs to opt out

-- Query Guardian's own metadata store — separate database, same instance,
-- for demo simplicity only (production self-hosted should use a separate
-- instance; see architecture doc section 2).
CREATE DATABASE qg_meta;
GRANT CONNECT ON DATABASE qg_meta TO query_guardian_reader;

-- Demo schema deliberately shaped to produce a classic N+1 pattern and a
-- missing-index seq scan, so the dashboard shows real signal on first run.
\c appdb

CREATE TABLE authors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL
);

CREATE TABLE books (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors(id), -- deliberately no index yet
  title TEXT NOT NULL,
  published_year INTEGER NOT NULL
);

INSERT INTO authors (name, country)
SELECT 'Author ' || i, (ARRAY['US','UK','FR','DE','JP'])[1 + (i % 5)]
FROM generate_series(1, 200) AS i;

INSERT INTO books (author_id, title, published_year)
SELECT (1 + (i % 200)), 'Book ' || i, 1950 + (i % 75)
FROM generate_series(1, 20000) AS i;

ANALYZE authors;
ANALYZE books;
