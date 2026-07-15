FROM postgres:16

COPY postgresql.conf /etc/postgresql/postgresql.conf
COPY init.sql /docker-entrypoint-initdb.d/01-init.sql

CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
