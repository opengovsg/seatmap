-- People table: persons exist independently of seats
create table people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  team        text,
  division    text,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

-- RLS
alter table people enable row level security;
create policy "auth read people"   on people for select to authenticated using (true);
create policy "auth insert people" on people for insert to authenticated with check (true);
create policy "auth update people" on people for update to authenticated using (true);

-- Link seats to people (occupant_* fields remain as cache)
alter table seats      add column person_id uuid references people(id) on delete set null;
alter table seat_drafts add column person_id uuid references people(id) on delete set null;

-- Indexes
create index on people(is_archived);
create index on seats(person_id);
create index on seat_drafts(person_id);
