insert into app.accounts (id, name)
values ('11111111-1111-1111-1111-111111111111','Lessul Demo')
on conflict do nothing;

insert into app.carriers (id, account_id, name, external_name, priority)
values
('22222222-2222-2222-2222-222222222221','11111111-1111-1111-1111-111111111111','Transportadora Sul','TSUL',10),
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','RodoBrasil','RBR',20)
on conflict do nothing;

insert into app.freight_tables (id, account_id, name, carrier_id)
values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','Tabela Demo','22222222-2222-2222-2222-222222222221')
on conflict do nothing;

insert into app.freight_table_versions (id, table_id, account_id, version_label, status)
values ('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','v1','PUBLISHED')
on conflict do nothing;

insert into app.freight_routes (version_id, account_id, cep_start, cep_end, state, city, min_weight, max_weight, base_amount, extra_per_kg, min_freight, ad_valorem_pct, gris_pct, trt_amount, tda_amount, cubing_factor, sla_days)
values ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','90000000','99999999','RS',null,0,5000,200,4,200,1.2,0.5,10,8,300,5)
on conflict do nothing;
