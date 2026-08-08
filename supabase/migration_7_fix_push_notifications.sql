-- =====================================================================
-- Waves — Migration 7: পুশ নোটিফিকেশন ট্রিগার বাগ ফিক্স
-- Supabase Dashboard > SQL Editor এ রান করুন।
--
-- এই মাইগ্রেশন schema.sql-এর STEP 4 (Web Push ট্রিগার) অংশটা রিপ্লেস করে।
-- ইতিমধ্যে schema.sql (full, আপডেটেড ভার্সন) রান করে থাকলে এটা আলাদা করে
-- রান করার দরকার নেই। এই ফাইলটা শুধু আগে থেকে চলমান ডাটাবেসে দ্রুত এই
-- একটা নির্দিষ্ট ফিক্স বসানোর জন্য।
--
-- কী বাগ ছিল (এটাই "অ্যাপ বন্ধ থাকলে কোনো নোটিফিকেশন না আসা"-র আসল কারণ):
-- ট্রিগার ফাংশনের ভেতরে একটা "এখনো সেটআপ করা হয়েছে কিনা" চেক ছিল, যেটা ভুলভাবে
-- <PROJECT_REF> প্লেসহোল্ডার বদলানোর *পরের* আসল প্রজেক্ট-রেফ স্ট্রিং দিয়ে লেখা
-- হয়েছিল। ফলে URL সঠিকভাবে পূরণ করার পরও সেই চেক সবসময় true হতো (কারণ URL-এ তো
-- সেই প্রজেক্ট-রেফ থাকবেই), আর ফাংশন প্রতিবার নীরবে স্কিপ হয়ে যেত — pg_net-কে
-- কখনো কলই করা হতো না, তাই Edge Function কখনো ট্রিগার হতো না।
--
-- 🔴 সিকিউরিটি সতর্কতা (এখনই করুন — এই মাইগ্রেশন রান করার আগে):
-- এই রিপোর schema.sql-এ আগে <PROJECT_REF> ও <WEBHOOK_SECRET>-এর জায়গায় আসল মান
-- হার্ডকোড করা অবস্থায় কমিট হয়ে গিয়েছিল। ধরে নিন ওই WEBHOOK_SECRET এখন এক্সপোজড।
--   ১) নতুন সিক্রেট বানান:       openssl rand -hex 32
--   ২) Edge Function-এ বসান:     supabase secrets set WEBHOOK_SECRET=<নতুন-মান>
--   ৩) আবার ডিপ্লয় করুন:         supabase functions deploy send-push --no-verify-jwt
--   ৪) নিচে <WEBHOOK_SECRET> প্লেসহোল্ডারে ওই *নতুন* মান বসান (পুরনোটা না)
--
-- ব্যবহার: নিচের <PROJECT_REF> ও <WEBHOOK_SECRET> (মোট ৪ জায়গা, দুই ফাংশনেই
-- একই মান) বদলে SQL Editor-এ রান করুন। বদলানো ভার্সনটা ফাইলে সেভ/কমিট করবেন
-- না — শুধু SQL Editor-এ পেস্ট করে রান করুন।
-- =====================================================================

create or replace function public.notify_new_message()
returns trigger as $$
declare
  fn_url text := 'https://muirhdipmymeganwrpgk.supabase.co/functions/v1/send-push';
  fn_secret text := 'e9f4a82b01c3d5e7f6a8b0c2d4e6f8a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e2';
begin
  if fn_url like '%muirhdipmymeganwrpgk%' or fn_secret like '%e9f4a82b01c3d5e7f6a8b0c2d4e6f8a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e2%' then
    return new; -- এখনো সেটআপ করা হয়নি (উপরের প্লেসহোল্ডার বদলানো হয়নি) — চুপচাপ স্কিপ করুন
  end if;

  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', fn_secret),
    body := jsonb_build_object(
      'type', 'message',
      'record', to_jsonb(new)
    )
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace function public.notify_new_call()
returns trigger as $$
declare
  fn_url text := 'https://muirhdipmymeganwrpgk.supabase.co/functions/v1/send-push';
  fn_secret text := 'e9f4a82b01c3d5e7f6a8b0c2d4e6f8a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e2';
begin
  if fn_url like '%muirhdipmymeganwrpgk%' or fn_secret like '%e9f4a82b01c3d5e7f6a8b0c2d4e6f8a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e2%' then
    return new;
  end if;

  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', fn_secret),
    body := jsonb_build_object(
      'type', 'call',
      'record', jsonb_build_object(
        'id', new.call_id,
        'target_user_id', new.user_id
      )
    )
  );
  return new;
end;
$$ language plpgsql security definer;

-- ট্রিগারগুলো call_logs নয়, call_participants-এর insert-এ থাকা উচিত (তখনই
-- recipientIds পাওয়া যায়) — নিশ্চিত করতে আবার তৈরি করা হলো।
drop trigger if exists trg_notify_new_message on public.messages;
create trigger trg_notify_new_message
  after insert on public.messages
  for each row execute function public.notify_new_message();

drop trigger if exists trg_notify_new_call on public.call_logs;
drop trigger if exists trg_notify_call_participant on public.call_participants;
create trigger trg_notify_call_participant
  after insert on public.call_participants
  for each row execute function public.notify_new_call();
