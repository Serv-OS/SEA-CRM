-- Amex is a single rate (not split by presentment). Visa/Mastercard keep
-- card-present / card-not-present. Categories: visa_mc_cp, visa_mc_cnp, amex.

-- Migrate any previously-entered Amex CP value to the single 'amex'; drop CNP.
update public.processing_rates set category = 'amex' where category = 'amex_cp'
  and not exists (select 1 from public.processing_rates r2 where r2.account_id = processing_rates.account_id and r2.category = 'amex');
delete from public.processing_rates where category in ('amex_cp', 'amex_cnp');

alter table public.processing_rates drop constraint if exists processing_rates_category_check;
alter table public.processing_rates add constraint processing_rates_category_check
  check (category in ('visa_mc_cp', 'visa_mc_cnp', 'amex'));
