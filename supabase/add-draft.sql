-- Draft seating system
-- Run this in the Supabase SQL editor

-- 1. Shadow table: one row per seat when a draft is active
create table seat_drafts (
  seat_id           uuid primary key references seats(id) on delete cascade,
  floor_id          uuid not null references floors(id) on delete cascade,
  svg_rect_id       text not null,
  label             text not null,
  status            text not null default 'AVAILABLE'
                      check (status in ('AVAILABLE', 'OCCUPIED', 'RESERVED')),
  occupant_name     text,
  occupant_team     text,
  occupant_division text,
  notes             text,
  updated_at        timestamptz not null default now(),
  updated_by        text not null default ''
);

create index on seat_drafts(floor_id);

alter table seat_drafts enable row level security;
create policy "auth read drafts"   on seat_drafts for select to authenticated using (true);
create policy "auth insert drafts" on seat_drafts for insert to authenticated with check (true);
create policy "auth update drafts" on seat_drafts for update to authenticated using (true);
create policy "auth delete drafts" on seat_drafts for delete to authenticated using (true);

-- 2. Singleton row: global flag for whether draft mode is active
create table draft_state (
  id        int primary key default 1 check (id = 1),
  is_active boolean not null default false
);
insert into draft_state values (1, false);

alter table draft_state enable row level security;
create policy "auth read draft_state"   on draft_state for select to authenticated using (true);
create policy "auth update draft_state" on draft_state for update to authenticated using (true);

-- 3. Atomic publish: copies draft rows into seats, cleans up draft
create or replace function publish_seat_draft(p_floor_id uuid)
returns void language plpgsql security definer as $$
begin
  update seats s
  set
    status            = d.status,
    occupant_name     = d.occupant_name,
    occupant_team     = d.occupant_team,
    occupant_division = d.occupant_division,
    notes             = d.notes,
    label             = d.label
  from seat_drafts d
  where s.id = d.seat_id and d.floor_id = p_floor_id;

  delete from seat_drafts where floor_id = p_floor_id;
  update draft_state set is_active = false where id = 1;
end;
$$;
