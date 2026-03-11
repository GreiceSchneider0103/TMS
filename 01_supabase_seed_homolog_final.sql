-- 01_supabase_seed_homolog.sql
-- Seed mínima de homologação para smoke tests

-- IDs fixos para facilitar testes manuais
-- account
insert into app.accounts (id, name)
values ('11111111-1111-1111-1111-111111111111', 'Lessul Homolog')
on conflict (id) do update set name = excluded.name;

-- company
insert into app.companies (
  id, account_id, cnpj, trade_name, legal_name, postal_code, city, state, address_line
)
values (
  '11111111-1111-1111-1111-111111111112',
  '11111111-1111-1111-1111-111111111111',
  '12345678000199',
  'Lessul Moveis',
  'Lessul Moveis LTDA',
  '90010000',
  'Porto Alegre',
  'RS',
  'Rua Exemplo, 100'
)
on conflict (id) do update set trade_name = excluded.trade_name, legal_name = excluded.legal_name;

-- distribution center
insert into app.distribution_centers (
  id, account_id, company_id, name, postal_code, city, state, address_line, operating_hours, is_active
)
values (
  '11111111-1111-1111-1111-111111111113',
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111112',
  'CD Porto Alegre',
  '90020000',
  'Porto Alegre',
  'RS',
  'Av. Logistica, 500',
  '{"seg-sex":"08:00-18:00"}'::jsonb,
  true
)
on conflict (id) do update set name = excluded.name, operating_hours = excluded.operating_hours;

-- carriers
insert into app.carriers (id, account_id, name, external_name, priority, is_active)
values
('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Transportadora Sul', 'TSUL', 10, true),
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'RodoBrasil', 'RBR', 20, true)
on conflict (id) do update set name = excluded.name, priority = excluded.priority, is_active = excluded.is_active;

-- carrier services
insert into app.carrier_services (id, carrier_id, account_id, name, sla_days, constraints, is_active)
values
('22222222-2222-2222-2222-222222222231', '22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Rodoviario Convencional', 5, '{}'::jsonb, true),
('22222222-2222-2222-2222-222222222232', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Rodoviario Expresso', 3, '{}'::jsonb, true)
on conflict (id) do update set name = excluded.name, sla_days = excluded.sla_days, is_active = excluded.is_active;

-- produto + logística
insert into app.products (id, account_id, sku_internal, sku_external, name, category)
values (
  '33333333-3333-3333-3333-333333333331',
  '11111111-1111-1111-1111-111111111111',
  'SOFA-3L-001',
  'EXT-SOFA-001',
  'Sofa 3 Lugares',
  'estofado'
)
on conflict (id) do update set name = excluded.name, category = excluded.category;

insert into app.product_logistics (
  product_id, account_id, weight_kg, length_cm, width_cm, height_cm, cubing_factor, classification, restrictions
)
values (
  '33333333-3333-3333-3333-333333333331',
  '11111111-1111-1111-1111-111111111111',
  55.000, 210.00, 95.00, 85.00, 300.00, 'volumoso', '{}'::jsonb
)
on conflict (product_id) do update set
  weight_kg = excluded.weight_kg,
  length_cm = excluded.length_cm,
  width_cm = excluded.width_cm,
  height_cm = excluded.height_cm,
  cubing_factor = excluded.cubing_factor,
  classification = excluded.classification;

-- tabela de frete + versão publicada
insert into app.freight_tables (id, account_id, name, carrier_id)
values
('44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', 'Tabela Sul v1', '22222222-2222-2222-2222-222222222221'),
('44444444-4444-4444-4444-444444444442', '11111111-1111-1111-1111-111111111111', 'Tabela Brasil v1', '22222222-2222-2222-2222-222222222222')
on conflict (id) do update set name = excluded.name;

insert into app.freight_table_versions (
  id, table_id, account_id, version_label, status, valid_from, raw_file_path
)
values
('44444444-4444-4444-4444-444444444451', '44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', 'v1', 'PUBLISHED', current_date, 'seed://tabela-sul-v1.xlsx'),
('44444444-4444-4444-4444-444444444452', '44444444-4444-4444-4444-444444444442', '11111111-1111-1111-1111-111111111111', 'v1', 'PUBLISHED', current_date, 'seed://tabela-brasil-v1.xlsx')
on conflict (id) do update set status = excluded.status, version_label = excluded.version_label;

-- rotas mínimas para cotação
insert into app.freight_routes (
  id, version_id, account_id, cep_start, cep_end, state, city,
  min_weight, max_weight, base_amount, extra_per_kg, min_freight,
  ad_valorem_pct, gris_pct, trt_amount, tda_amount, cubing_factor, sla_days, restrictions
)
values
('55555555-5555-5555-5555-555555555561', '44444444-4444-4444-4444-444444444451', '11111111-1111-1111-1111-111111111111', '90000000', '99999999', 'RS', null, 0, 5000, 200, 4, 200, 1.2, 0.5, 10, 8, 300, 5, '{}'::jsonb),
('55555555-5555-5555-5555-555555555562', '44444444-4444-4444-4444-444444444452', '11111111-1111-1111-1111-111111111111', '00000000', '89999999', null, null, 0, 5000, 260, 5, 260, 1.4, 0.6, 12, 10, 300, 7, '{}'::jsonb)
on conflict (id) do update set
  base_amount = excluded.base_amount,
  extra_per_kg = excluded.extra_per_kg,
  min_freight = excluded.min_freight,
  ad_valorem_pct = excluded.ad_valorem_pct,
  gris_pct = excluded.gris_pct;

-- taxas por destinatário para smoke
insert into app.freight_recipient_fees (
  id, account_id, version_id, recipient_document, fee_type, amount, metadata
)
values (
  '66666666-6666-6666-6666-666666666661',
  '11111111-1111-1111-1111-111111111111',
  '44444444-4444-4444-4444-444444444451',
  '12345678901',
  'agendamento',
  35.00,
  '{}'::jsonb
)
on conflict (id) do update set amount = excluded.amount;

-- regras básicas
insert into app.shipping_rules (
  id, account_id, name, description, priority, active, valid_from, conditions, actions
)
values
(
  '77777777-7777-7777-7777-777777777771',
  '11111111-1111-1111-1111-111111111111',
  'Desconto RS Canal Tiny',
  'Aplica desconto em pedidos do canal tiny para RS',
  10,
  true,
  current_date,
  '{"channel":"tiny","state":"RS"}'::jsonb,
  '{"discount_percent":5}'::jsonb
),
(
  '77777777-7777-7777-7777-777777777772',
  '11111111-1111-1111-1111-111111111111',
  'Priorizar Transportadora Sul',
  'Prioriza carrier TSUL para região Sul',
  20,
  true,
  current_date,
  '{"state":"RS"}'::jsonb,
  '{"prioritize_carrier":"22222222-2222-2222-2222-222222222221"}'::jsonb
)
on conflict (id) do update set
  active = excluded.active,
  conditions = excluded.conditions,
  actions = excluded.actions;

