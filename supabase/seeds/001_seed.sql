insert into app.accounts (id, name)
values ('11111111-1111-1111-1111-111111111111','Lessul Demo')
on conflict do nothing;

insert into app.carriers (account_id, name, external_name, priority)
values
('11111111-1111-1111-1111-111111111111','Transportadora Sul','TSUL',10),
('11111111-1111-1111-1111-111111111111','RodoBrasil','RBR',20)
on conflict do nothing;
