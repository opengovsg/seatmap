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
  update draft_state set is_active = false, name = null where id = 1;
end;
$$;
