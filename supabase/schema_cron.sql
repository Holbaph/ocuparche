-- Ocuparche — programa el aviso automático (pg_cron + pg_net)
-- Corre esto DESPUÉS de haber desplegado la Edge Function send-patch-reminders
-- (supabase functions deploy send-patch-reminders) y de tener tu ANON KEY a
-- mano (Project Settings → API).
--
-- Reemplaza TU-PROJECT-REF y TU-ANON-KEY antes de correr esto, y pega todo el
-- archivo en Supabase → SQL Editor → New query → Run. Es seguro reejecutarlo.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'send-patch-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://TU-PROJECT-REF.supabase.co/functions/v1/send-patch-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer TU-ANON-KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
