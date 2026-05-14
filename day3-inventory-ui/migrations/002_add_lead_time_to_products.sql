-- +migrate Up

ALTER TABLE products ADD COLUMN lead_time_days INTEGER NOT NULL DEFAULT 7 CHECK (lead_time_days >= 0);

-- +migrate Down

ALTER TABLE products DROP COLUMN lead_time_days;
