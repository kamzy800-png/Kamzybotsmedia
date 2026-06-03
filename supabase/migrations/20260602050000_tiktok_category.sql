-- Add TikTok to product categories (idempotent)
insert into public.product_categories (name, slug, description)
select 'TikTok Accounts', 'tiktok', 'Verified TikTok accounts with established following'
where not exists (
  select 1 from public.product_categories where slug = 'tiktok'
);
