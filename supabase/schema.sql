-- SeatMap schema
-- Run this in the Supabase SQL editor

-- TABLES

create table floors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  svg_content text not null
);

create table seats (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references floors(id) on delete cascade,
  svg_rect_id text not null unique,
  label text not null,
  status text not null default 'AVAILABLE'
    check (status in ('AVAILABLE', 'OCCUPIED', 'RESERVED')),
  occupant_name text,
  occupant_team text,
  notes text,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  seat_id uuid not null references seats(id) on delete cascade,
  editor_email text not null,
  action text not null
    check (action in ('ASSIGN', 'UNASSIGN', 'MOVE', 'RESERVE', 'UPDATE')),
  field text,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

-- INDEXES

create index on seats(floor_id);
create index on seats(status);
create index on audit_logs(seat_id);
create index on audit_logs(created_at desc);

-- ROW LEVEL SECURITY

alter table floors enable row level security;
alter table seats enable row level security;
alter table audit_logs enable row level security;

-- MVP: any authenticated user can read and write everything
create policy "auth read floors" on floors for select to authenticated using (true);
create policy "auth update floors" on floors for update to authenticated using (true);

create policy "auth read seats" on seats for select to authenticated using (true);
create policy "auth insert seats" on seats for insert to authenticated with check (true);
create policy "auth update seats" on seats for update to authenticated using (true);

create policy "auth read audit" on audit_logs for select to authenticated using (true);
create policy "auth insert audit" on audit_logs for insert to authenticated with check (true);

-- ATOMIC SEAT SWAP FUNCTION
-- Used by the Move flow to swap two seats in a single transaction

create or replace function swap_seats(seat_a_id uuid, seat_b_id uuid)
returns void language plpgsql security definer as $$
declare
  a_name text; a_team text;
  b_name text; b_team text;
begin
  select occupant_name, occupant_team into a_name, a_team
    from seats where id = seat_a_id;
  select occupant_name, occupant_team into b_name, b_team
    from seats where id = seat_b_id;

  update seats
    set occupant_name = b_name, occupant_team = b_team, status = 'OCCUPIED'
    where id = seat_a_id;

  update seats
    set occupant_name = a_name, occupant_team = a_team, status = 'OCCUPIED'
    where id = seat_b_id;
end;
$$;
