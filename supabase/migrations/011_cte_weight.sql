-- 011: peso cobrado no CT-e (para comparar kg calculado x kg cobrado no financeiro)
alter table app.ctes add column if not exists peso_cobrado numeric(14,3);
alter table app.ctes add column if not exists peso_real numeric(14,3);
