-- §14: the confirm/discard status transition on ai_previews is already a
-- direct client write (ai_previews_update_status, Step 1's RLS). This
-- trigger is what makes a "confirmed" transition actually take effect —
-- it parses proposed_changes (written by the ai-preview edge function,
-- service_role only) and applies it as real events writes, logging one
-- itinerary_change_log row per changed event. A "discarded" transition
-- does nothing here — no rows in proposed_changes are ever touched.
--
-- proposed_changes shape:
-- {
--   "creates": [{ category_id, name, day, start_time, end_time, ... }],
--   "updates": [{ "event_id": uuid, "changes": {...partial event fields} }],
--   "deletes": [{ "event_id": uuid, "mode": "delete" | "skip" }]
-- }
--
-- Regenerating derived transit/check-in/check-out events for the affected
-- day is deliberately NOT done here — that needs the routing engine (an
-- external HTTP call), which a plain SQL trigger can't make. The client
-- calls the existing recalculate-day edge function (Step 5) right after a
-- successful confirm, exactly as it already does after any other edit.

create or replace function public.ai_previews_apply_on_confirm()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  new_id uuid;
  old_row jsonb;
begin
  if new.status <> 'confirmed' or old.status <> 'pending' then
    return new;
  end if;

  for item in select * from jsonb_array_elements(coalesce(new.proposed_changes->'creates', '[]'::jsonb))
  loop
    insert into events (
      trip_id, category_id, name, day, start_time, end_time, start_time_label,
      planning_status, price, description, maps_place_id, maps_link,
      visit_duration_minutes, opening_hours, is_derived, created_by
    ) values (
      new.trip_id,
      (item->>'category_id')::uuid,
      item->>'name',
      nullif(item->>'day', '')::date,
      nullif(item->>'start_time', '')::time,
      nullif(item->>'end_time', '')::time,
      nullif(item->>'start_time_label', ''),
      coalesce(item->>'planning_status', 'planned')::planning_status,
      item->>'price',
      item->>'description',
      item->>'maps_place_id',
      item->>'maps_link',
      nullif(item->>'visit_duration_minutes', '')::int,
      item->'opening_hours',
      false,
      auth.uid()
    )
    returning id into new_id;

    insert into itinerary_change_log (trip_id, event_id, change_type, old_value, new_value, triggered_by_user, ai_preview_id)
    values (new.trip_id, new_id, 'ai_create', null, item, auth.uid(), new.id);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(new.proposed_changes->'updates', '[]'::jsonb))
  loop
    select to_jsonb(e) into old_row from events e where e.id = (item->>'event_id')::uuid;

    update events e set
      (name, day, start_time, end_time, start_time_label, end_time_label, planning_status,
       price, description, website, contact, visit_duration_minutes, maps_place_id, maps_link,
       opening_hours, kitchen_closing_time, check_in_window_start, check_in_window_end,
       checkout_deadline, is_skipped, updated_by)
      = (select r.name, r.day, r.start_time, r.end_time, r.start_time_label, r.end_time_label, r.planning_status,
                r.price, r.description, r.website, r.contact, r.visit_duration_minutes, r.maps_place_id, r.maps_link,
                r.opening_hours, r.kitchen_closing_time, r.check_in_window_start, r.check_in_window_end,
                r.checkout_deadline, r.is_skipped, auth.uid()
         from jsonb_populate_record(e, item->'changes') r)
    where e.id = (item->>'event_id')::uuid;

    insert into itinerary_change_log (trip_id, event_id, change_type, old_value, new_value, triggered_by_user, ai_preview_id)
    values (new.trip_id, (item->>'event_id')::uuid, 'ai_update', old_row, item->'changes', auth.uid(), new.id);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(new.proposed_changes->'deletes', '[]'::jsonb))
  loop
    select to_jsonb(e) into old_row from events e where e.id = (item->>'event_id')::uuid;

    if item->>'mode' = 'skip' then
      update events set is_skipped = true, updated_by = auth.uid() where id = (item->>'event_id')::uuid;
    else
      delete from events where id = (item->>'event_id')::uuid;
    end if;

    insert into itinerary_change_log (trip_id, event_id, change_type, old_value, new_value, triggered_by_user, ai_preview_id)
    values (new.trip_id, (item->>'event_id')::uuid, 'ai_delete', old_row, jsonb_build_object('mode', item->>'mode'), auth.uid(), new.id);
  end loop;

  return new;
end;
$$;

create trigger ai_previews_apply_on_confirm
  after update on ai_previews
  for each row execute function public.ai_previews_apply_on_confirm();
