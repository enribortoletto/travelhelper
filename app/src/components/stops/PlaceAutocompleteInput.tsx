import { useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

export interface PickedPlace {
  placeId: string;
  name: string;
  mapsLink: string;
}

/**
 * Free-text stop-name field that upgrades to a real place once the user
 * picks a Google Places suggestion — the placeId it captures is what §6/§7/§8
 * (travel estimates, transit generation, opening hours) need to compute
 * anything at all. Typing a name without picking a suggestion is still a
 * valid stop, just one none of those features can act on yet.
 *
 * Uses the new `PlaceAutocompleteElement` (not the legacy `Autocomplete`
 * class) — this project only has "Places API (New)" enabled, not the
 * legacy Places API the old widget depends on.
 */
export function PlaceAutocompleteInput({
  value,
  onChange,
  onPlaceSelected,
}: {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelected: (place: PickedPlace) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const placesLibrary = useMapsLibrary("places");

  useEffect(() => {
    if (!placesLibrary || !containerRef.current) return;

    const element = new placesLibrary.PlaceAutocompleteElement();
    element.value = value;
    elementRef.current = element;
    containerRef.current.appendChild(element);

    function handleInput() {
      onChange(element.value);
    }

    async function handleSelect(event: google.maps.places.PlacePredictionSelectEvent) {
      const place = event.placePrediction.toPlace();
      await place.fetchFields({ fields: ["id", "displayName", "googleMapsURI"] });
      const name = place.displayName ?? element.value;
      onChange(name);
      onPlaceSelected({
        placeId: place.id!,
        name,
        mapsLink: place.googleMapsURI ?? `https://www.google.com/maps/place/?q=place_id:${place.id}`,
      });
    }

    element.addEventListener("input", handleInput);
    element.addEventListener("gmp-select", handleSelect as unknown as EventListener);

    return () => {
      element.removeEventListener("input", handleInput);
      element.removeEventListener("gmp-select", handleSelect as unknown as EventListener);
      containerRef.current?.removeChild(element);
    };
    // Deliberately re-runs only when the library loads — `value`/`onChange`
    // are read live inside the closures above, not re-bound per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLibrary]);

  return <div ref={containerRef} className="[&>*]:w-full" />;
}
