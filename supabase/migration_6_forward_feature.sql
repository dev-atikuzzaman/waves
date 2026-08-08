-- =====================================================================
-- Waves — Migration 6: Forward message feature
-- Supabase Dashboard > SQL Editor এ রান করুন।
-- ইতিমধ্যে সাম্প্রতিক schema.sql (full) রান করে থাকলে এই ফাইলটা আলাদা করে
-- রান করার দরকার নেই — schema.sql-এ এই কলামটা ইতিমধ্যে idempotent-ভাবে
-- যোগ করা আছে। এটা শুধু আগে থেকে চলমান ডাটাবেসের জন্য দ্রুত ইনক্রিমেন্টাল
-- আপডেট হিসেবে।
-- =====================================================================

alter table public.messages add column if not exists forwarded boolean not null default false;
