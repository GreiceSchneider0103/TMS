alter table app.companies add column if not exists deleted_at timestamptz;
alter table app.distribution_centers add column if not exists deleted_at timestamptz;
alter table app.carriers add column if not exists deleted_at timestamptz;
alter table app.carrier_services add column if not exists deleted_at timestamptz;
alter table app.products add column if not exists deleted_at timestamptz;
alter table app.recipients add column if not exists deleted_at timestamptz;

alter table app.sync_jobs add column if not exists next_retry_at timestamptz;
alter table app.sync_jobs add column if not exists dead_letter boolean not null default false;

create unique index if not exists uq_recipients_document_active
on app.recipients(account_id, document)
where deleted_at is null;
