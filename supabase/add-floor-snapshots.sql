-- Migration: add floor_snapshots table for SVG version history
-- Run this in the Supabase SQL editor

create table floor_snapshots (
  id          uuid primary key default gen_random_uuid(),
  floor_id    uuid not null references floors(id) on delete cascade,
  svg_content text not null,
  seat_data   jsonb not null,
  created_at  timestamptz not null default now()
);

create index on floor_snapshots(floor_id);
create index on floor_snapshots(created_at desc);

alter table floor_snapshots enable row level security;

create policy "auth read snapshots"   on floor_snapshots for select to authenticated using (true);
create policy "auth insert snapshots" on floor_snapshots for insert to authenticated with check (true);
