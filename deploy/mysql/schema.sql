CREATE DATABASE IF NOT EXISTS zhixiao_ai
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE zhixiao_ai;

CREATE TABLE IF NOT EXISTS app_meta (
  meta_key VARCHAR(100) PRIMARY KEY,
  meta_value JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  customer_scope VARCHAR(40) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  data JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_units (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  parent_id VARCHAR(80) NULL,
  type VARCHAR(40) NULL,
  level_no INT NULL,
  path_text VARCHAR(800) NULL,
  zone VARCHAR(80) NULL,
  sort_no INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  data JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_units_parent (parent_id),
  KEY idx_units_zone (zone),
  KEY idx_units_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  account VARCHAR(80) NULL,
  username VARCHAR(80) NULL,
  phone VARCHAR(40) NULL,
  name VARCHAR(120) NOT NULL,
  role VARCHAR(80) NULL,
  role_id VARCHAR(80) NULL,
  unit_id VARCHAR(80) NULL,
  unit VARCHAR(160) NULL,
  zone VARCHAR(80) NULL,
  org_path VARCHAR(800) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  auth_version INT NOT NULL DEFAULT 0,
  data JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_account (account),
  KEY idx_users_role (role),
  KEY idx_users_role_id (role_id),
  KEY idx_users_unit_id (unit_id),
  KEY idx_users_zone (zone),
  KEY idx_users_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(40) NULL,
  phone_normalized VARCHAR(40) NULL,
  city VARCHAR(120) NULL,
  address VARCHAR(800) NULL,
  channel_source VARCHAR(120) NULL,
  created_by VARCHAR(120) NULL,
  created_by_id BIGINT NULL,
  owner VARCHAR(120) NULL,
  owner_id BIGINT NULL,
  unit_id VARCHAR(80) NULL,
  unit VARCHAR(160) NULL,
  zone VARCHAR(80) NULL,
  lifecycle_status VARCHAR(40) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  data JSON NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_customers_phone_normalized (phone_normalized),
  KEY idx_customers_name (name),
  KEY idx_customers_city (city),
  KEY idx_customers_channel (channel_source),
  KEY idx_customers_owner (owner_id),
  KEY idx_customers_unit (unit_id),
  KEY idx_customers_zone (zone),
  KEY idx_customers_lifecycle (lifecycle_status),
  KEY idx_customers_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS opportunities (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  stage VARCHAR(60) NULL,
  product_id VARCHAR(80) NULL,
  product_name VARCHAR(160) NULL,
  owner VARCHAR(120) NULL,
  owner_id BIGINT NULL,
  follow_person VARCHAR(120) NULL,
  created_by VARCHAR(120) NULL,
  created_by_id BIGINT NULL,
  unit_id VARCHAR(80) NULL,
  unit VARCHAR(160) NULL,
  zone VARCHAR(80) NULL,
  ownership_status VARCHAR(60) NULL,
  lifecycle_status VARCHAR(60) NULL,
  outcome_status VARCHAR(60) NULL,
  public_pool_at DATETIME NULL,
  assigned_at DATETIME NULL,
  last_follow_at DATETIME NULL,
  next_follow_at DATETIME NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  contract_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  data JSON NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_opp_customer (customer_id),
  KEY idx_opp_stage (stage),
  KEY idx_opp_owner (owner_id),
  KEY idx_opp_unit (unit_id),
  KEY idx_opp_zone (zone),
  KEY idx_opp_ownership (ownership_status),
  KEY idx_opp_lifecycle (lifecycle_status),
  KEY idx_opp_outcome (outcome_status),
  KEY idx_opp_public_pool_at (public_pool_at),
  KEY idx_opp_assigned_at (assigned_at),
  KEY idx_opp_last_follow (last_follow_at),
  KEY idx_opp_next_follow (next_follow_at),
  KEY idx_opp_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS follow_ups (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source_key VARCHAR(160) NOT NULL,
  opportunity_id BIGINT NULL,
  customer_id BIGINT NULL,
  follow_date DATETIME NULL,
  next_follow_at DATETIME NULL,
  author VARCHAR(120) NULL,
  author_id BIGINT NULL,
  note TEXT NULL,
  is_manual TINYINT(1) NOT NULL DEFAULT 0,
  data JSON NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_follow_source (source_key),
  KEY idx_follow_opp (opportunity_id),
  KEY idx_follow_customer (customer_id),
  KEY idx_follow_date (follow_date),
  KEY idx_follow_author (author_id),
  KEY idx_follow_manual (is_manual)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visits (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT NULL,
  opportunity_id BIGINT NULL,
  factory VARCHAR(255) NULL,
  city VARCHAR(120) NULL,
  address VARCHAR(800) NULL,
  owner VARCHAR(120) NULL,
  owner_id BIGINT NULL,
  visit_date DATETIME NULL,
  latitude DECIMAL(12,8) NULL,
  longitude DECIMAL(12,8) NULL,
  data JSON NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_visits_customer (customer_id),
  KEY idx_visits_owner (owner_id),
  KEY idx_visits_date (visit_date),
  KEY idx_visits_city (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dictionary_items (
  type VARCHAR(60) NOT NULL,
  id VARCHAR(100) NOT NULL,
  name VARCHAR(200) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_no INT NOT NULL DEFAULT 0,
  data JSON NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (type, id),
  KEY idx_dict_type_active (type, active),
  KEY idx_dict_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source_key VARCHAR(160) NOT NULL,
  event_type VARCHAR(100) NULL,
  actor VARCHAR(120) NULL,
  actor_id BIGINT NULL,
  target_id VARCHAR(120) NULL,
  event_at DATETIME NULL,
  data JSON NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_audit_source (source_key),
  KEY idx_audit_type (event_type),
  KEY idx_audit_actor (actor_id),
  KEY idx_audit_at (event_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS raw_state_snapshots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source_file VARCHAR(800) NOT NULL,
  state_version VARCHAR(80) NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
