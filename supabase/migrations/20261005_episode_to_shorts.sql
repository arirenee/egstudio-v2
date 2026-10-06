-- Add the $199 Episode-to-Shorts offer while preserving legacy Starter/Sprint records.
alter table public.orders drop constraint if exists orders_offer_check;
alter table public.orders add constraint orders_offer_check check (offer = any (array['episode'::text,'test'::text,'sprint'::text]));
alter table public.orders drop constraint if exists orders_amount_total_check;
alter table public.orders add constraint orders_amount_total_check check (amount_total = any (array[19900,30000,150000]));

alter table public.intake_submissions drop constraint if exists intake_submissions_offer_check;
alter table public.intake_submissions add constraint intake_submissions_offer_check check (offer = any (array['episode'::text,'test'::text,'sprint'::text]));
alter table public.intake_submissions drop constraint if exists intake_submissions_amount_total_check;
alter table public.intake_submissions add constraint intake_submissions_amount_total_check check (amount_total = any (array[19900,30000,150000]));

alter table public.client_onboarding_jobs drop constraint if exists client_onboarding_jobs_package_check;
alter table public.client_onboarding_jobs add constraint client_onboarding_jobs_package_check check (package = any (array['episode'::text,'test'::text,'sprint'::text]));
