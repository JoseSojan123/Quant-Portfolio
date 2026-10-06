-- 001_initial_schema.sql
--
-- The application calls Base.metadata.create_all() at startup, so these tables
-- are created automatically on first boot against SQLite or PostgreSQL alike.
-- This file is the same schema written out explicitly, for three cases:
--
--   * reviewing the data model without reading the ORM;
--   * provisioning a managed PostgreSQL or Supabase database by hand, before the
--     application connects to it with a least-privilege role;
--   * diffing against a live database to see whether it is up to date.
--
-- Apply it with:
--     psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
--
-- It is written to be idempotent: every statement uses IF NOT EXISTS, so running
-- it twice is harmless. Generated from backend/app/db/models.py; if you change a
-- model, regenerate this file rather than editing it by hand.

BEGIN;

CREATE TABLE IF NOT EXISTS assets (
	asset_id SERIAL NOT NULL, 
	ticker VARCHAR(16) NOT NULL, 
	name VARCHAR(128) NOT NULL, 
	sector VARCHAR(64) NOT NULL, 
	asset_type VARCHAR(16) NOT NULL, 
	currency VARCHAR(8) NOT NULL, 
	tags JSON NOT NULL, 
	is_benchmark BOOLEAN NOT NULL, 
	PRIMARY KEY (asset_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_assets_ticker ON assets (ticker);

CREATE TABLE IF NOT EXISTS data_updates (
	id SERIAL NOT NULL, 
	started_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	finished_at TIMESTAMP WITH TIME ZONE, 
	status VARCHAR(16) NOT NULL, 
	source VARCHAR(32) NOT NULL, 
	rows_upserted INTEGER NOT NULL, 
	first_date DATE, 
	last_date DATE, 
	message TEXT, 
	report JSON, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS users (
	id VARCHAR(36) NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	full_name VARCHAR(120) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	email_verified BOOLEAN NOT NULL, 
	is_guest BOOLEAN NOT NULL, 
	token_version INTEGER NOT NULL, 
	preferences JSON NOT NULL, 
	default_portfolio_id VARCHAR(36), 
	terms_accepted_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	last_login_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email);

CREATE TABLE IF NOT EXISTS portfolios (
	id VARCHAR(36) NOT NULL, 
	owner_id VARCHAR(36) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	description TEXT, 
	base_currency VARCHAR(8) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_portfolios_owner_id ON portfolios (owner_id);

CREATE TABLE IF NOT EXISTS prices_daily (
	asset_id INTEGER NOT NULL, 
	date DATE NOT NULL, 
	open FLOAT, 
	high FLOAT, 
	low FLOAT, 
	close FLOAT NOT NULL, 
	adjusted_close FLOAT NOT NULL, 
	volume BIGINT, 
	source VARCHAR(32) NOT NULL, 
	downloaded_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (asset_id, date), 
	FOREIGN KEY(asset_id) REFERENCES assets (asset_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_prices_daily_date ON prices_daily (date);

CREATE TABLE IF NOT EXISTS returns_daily (
	asset_id INTEGER NOT NULL, 
	date DATE NOT NULL, 
	simple_return FLOAT NOT NULL, 
	log_return FLOAT NOT NULL, 
	PRIMARY KEY (asset_id, date), 
	FOREIGN KEY(asset_id) REFERENCES assets (asset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS optimization_runs (
	run_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	portfolio_id VARCHAR(36), 
	name VARCHAR(120), 
	objective VARCHAR(32) NOT NULL, 
	capital FLOAT NOT NULL, 
	request JSON NOT NULL, 
	result JSON NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (run_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(portfolio_id) REFERENCES portfolios (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_optimization_runs_user_id ON optimization_runs (user_id);

CREATE TABLE IF NOT EXISTS portfolio_holdings (
	id VARCHAR(36) NOT NULL, 
	portfolio_id VARCHAR(36) NOT NULL, 
	ticker VARCHAR(16) NOT NULL, 
	quantity FLOAT NOT NULL, 
	average_cost FLOAT NOT NULL, 
	asset_type VARCHAR(16), 
	currency VARCHAR(8) NOT NULL, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_holding_portfolio_ticker UNIQUE (portfolio_id, ticker), 
	FOREIGN KEY(portfolio_id) REFERENCES portfolios (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_portfolio_holdings_portfolio_id ON portfolio_holdings (portfolio_id);

CREATE TABLE IF NOT EXISTS rebalance_runs (
	run_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	portfolio_id VARCHAR(36), 
	turnover FLOAT NOT NULL, 
	cost FLOAT NOT NULL, 
	cost_rate FLOAT NOT NULL, 
	threshold FLOAT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (run_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(portfolio_id) REFERENCES portfolios (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_rebalance_runs_user_id ON rebalance_runs (user_id);

CREATE TABLE IF NOT EXISTS saved_scenarios (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	portfolio_id VARCHAR(36), 
	name VARCHAR(120) NOT NULL, 
	kind VARCHAR(16) NOT NULL, 
	config JSON NOT NULL, 
	summary JSON, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(portfolio_id) REFERENCES portfolios (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_saved_scenarios_user_id ON saved_scenarios (user_id);

CREATE TABLE IF NOT EXISTS portfolio_weights (
	run_id VARCHAR(36) NOT NULL, 
	ticker VARCHAR(16) NOT NULL, 
	weight FLOAT NOT NULL, 
	current_weight FLOAT, 
	PRIMARY KEY (run_id, ticker), 
	FOREIGN KEY(run_id) REFERENCES optimization_runs (run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rebalance_items (
	run_id VARCHAR(36) NOT NULL, 
	ticker VARCHAR(16) NOT NULL, 
	current_weight FLOAT NOT NULL, 
	target_weight FLOAT NOT NULL, 
	trade_value FLOAT NOT NULL, 
	PRIMARY KEY (run_id, ticker), 
	FOREIGN KEY(run_id) REFERENCES rebalance_runs (run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS risk_metrics (
	run_id VARCHAR(36) NOT NULL, 
	expected_return FLOAT, 
	volatility FLOAT, 
	sharpe FLOAT, 
	var_95 FLOAT, 
	es_95 FLOAT, 
	max_drawdown FLOAT, 
	PRIMARY KEY (run_id), 
	FOREIGN KEY(run_id) REFERENCES optimization_runs (run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stress_results (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	portfolio_id VARCHAR(36), 
	run_id VARCHAR(36), 
	scenario VARCHAR(64) NOT NULL, 
	pnl FLOAT NOT NULL, 
	loss_pct FLOAT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(portfolio_id) REFERENCES portfolios (id) ON DELETE SET NULL, 
	FOREIGN KEY(run_id) REFERENCES optimization_runs (run_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_stress_results_user_id ON stress_results (user_id);

COMMIT;
