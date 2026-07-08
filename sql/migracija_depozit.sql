-- Depozit pri rezervaciji (ulazi u cijenu; naplata na odlasku predlaže cijena - depozit)
alter table stays add column if not exists deposit numeric;

notify pgrst, 'reload schema';
