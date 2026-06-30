# Zhixiao AI MySQL migration runbook

This is phase 1 only: create MySQL tables and import the current `db.json`.
Do not switch production reads/writes to MySQL until the import and verify steps pass.

## 1. Install MySQL on the existing server

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
```

Alibaba Cloud Linux / CentOS-like:

```bash
sudo yum install -y mysql-server || sudo yum install -y mariadb-server
sudo systemctl enable --now mysqld || sudo systemctl enable --now mariadb
```

## 2. Create database and account

Run as root or a privileged MySQL account:

```sql
CREATE DATABASE IF NOT EXISTS zhixiao_ai
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'zhixiao_user'@'127.0.0.1' IDENTIFIED BY 'CHANGE_THIS_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON zhixiao_ai.* TO 'zhixiao_user'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Keep the password out of Git. Put it in the server environment only.

## 3. Apply schema

From the project root on the server:

```bash
mysql -u zhixiao_user -p zhixiao_ai < deploy/mysql/schema.sql
```

## 4. Back up production JSON before import

Use the actual production data path. Example:

```bash
mkdir -p /opt/zhixiao-ai/shared/data/manual-backups
cp /opt/zhixiao-ai/shared/data/db.json \
  /opt/zhixiao-ai/shared/data/manual-backups/db-before-mysql-$(date +%Y%m%d-%H%M%S).json
```

## 5. Install Node dependencies

```bash
npm install
```

This installs `mysql2`, which is used by the migration scripts.

## 6. Import JSON to MySQL

Use the production `db.json` path:

```bash
export MYSQL_URL='mysql://zhixiao_user:CHANGE_THIS_STRONG_PASSWORD@127.0.0.1:3306/zhixiao_ai'
export DATA_FILE='/opt/zhixiao-ai/shared/data/db.json'

node scripts/mysql/migrate-json-to-mysql.mjs --reset --snapshot
```

`--reset` truncates the MySQL tables before import. It does not touch `db.json`.
`--snapshot` stores one raw JSON snapshot in MySQL for audit and rollback reference.

## 7. Verify counts

```bash
node scripts/mysql/verify-mysql-migration.mjs
```

Expected result:

```text
OK users: mysql=N json=N
OK customers: mysql=N json=N
OK opportunities: mysql=N json=N
OK follow_ups: mysql=N json=N
MYSQL_VERIFY_OK
```

If any count is `MISMATCH`, do not switch production to MySQL.

## 8. Next phase

After phase 1 passes on the server:

1. Add a storage adapter to the backend.
2. Move high-traffic reads first: customer list, public pool list, dashboard.
3. Move writes next: follow-up, claim, assignment, import.
4. Keep `db.json` as a read-only rollback backup until MySQL has run safely for several days.

## Notes

- Photos/uploads stay on disk. MySQL stores paths/metadata only.
- The schema stores important searchable fields as columns and the original object as JSON.
- This makes the migration safer because old fields are not lost.
