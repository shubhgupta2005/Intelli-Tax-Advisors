-- Intelli Tax Advisors — spam protection for the contact form
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- Rejects an enquiry when:
--   • the same email already sent 3 in the last hour,
--   • more than 20 enquiries arrived in the last 10 minutes (a flood), or
--   • the message is stuffed with links (more than 3).
-- The form then falls back to opening an email, so a real person is never stuck.

create or replace function public.enquiry_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.enquiries
      where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Too many enquiries from this email — please try again later';
  end if;
  if (select count(*) from public.enquiries where created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'The form is busy — please try again in a few minutes';
  end if;
  if (select count(*) from regexp_matches(coalesce(new.message, ''), 'https?://|www\.', 'gi')) > 3 then
    raise exception 'Please remove the links from your message';
  end if;
  return new;
end $$;

drop trigger if exists enquiry_guard on public.enquiries;
create trigger enquiry_guard before insert on public.enquiries
  for each row execute function public.enquiry_guard();
