FROM postgres:18

COPY postgresql.conf /etc/postgresql/postgresql.conf
COPY init.sql /docker-entrypoint-initdb.d/01-init.sql
COPY --chmod=755 entrypoint.sh /usr/local/bin/query-guardian-entrypoint

ENTRYPOINT ["query-guardian-entrypoint"]
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
