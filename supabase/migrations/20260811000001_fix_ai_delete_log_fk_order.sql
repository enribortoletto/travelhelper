-- Bug found during Step 9 live verification: the "deletes" branch of
-- ai_previews_apply_on_confirm() deleted the event row, then tried to
-- insert an itinerary_change_log row referencing it — but
-- itinerary_change_log.event_id has "on delete cascade" and, more to the
-- point, is a normal foreign key, so inserting a log row that points at an
-- already-deleted event fails with a foreign-key violation. Confirmed live:
-- a "remove_stop" preview's confirm PATCH returned 409/23503 and the event
-- was never actually deleted (the whole trigger is one transaction, so the
-- failed log insert rolled back the delete too).
--
-- Fix: log the change first, delete second.

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

  -- deletes: log BEFORE deleting, since event_id's FK can't point at an
  -- already-removed row (see migration header).
  for item in select * from jsonb_array_elements(coalesce(new.proposed_changes->'deletes', '[]'::jsonb))
  loop
    select to_jsonb(e) into old_row from events e where e.id = (item->>'event_id')::uuid;

    if item->>'mode' = 'skip' then
      insert into itinerary_change_log (trip_id, event_id, change_type, old_value, new_value, triggered_by_user, ai_preview_id)
      values (new.trip_id, (item->>'event_id')::uuid, 'ai_delete', old_row, jsonb_build_object('mode', item->>'mode'), auth.uid(), new.id);

      update events set is_skipped = true, updated_by = auth.uid() where id = (item->>'event_id')::uuid;
    else
      insert into itinerary_change_log (trip_id, event_id, change_type, old_value, new_value, triggered_by_user, ai_preview_id)
      values (new.trip_id, null, 'ai_delete', old_row, jsonb_build_object('mode', item->>'mode'), auth.uid(), new.id);

      delete from events where id = (item->>'event_id')::uuid;
    end if;
  end loop;

  return new;
end;
$$;
