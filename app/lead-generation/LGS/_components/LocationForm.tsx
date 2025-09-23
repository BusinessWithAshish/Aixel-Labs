"use client";

import {useState, useMemo} from "react";
import { Country, State, City } from "country-state-city";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { InputWithLabel } from "@/components/wrappers/InputWithLabel";
import { CityCheckBox } from "./CityCheckbox";
import { MapPin, X } from "lucide-react";

interface LocationFormProps {
  query: string;
  onQueryChange: (query: string) => void;
  selectedCountry: string;
  onCountryChange: (country: string) => void;
  selectedState: string;
  onStateChange: (state: string) => void;
  selectedCities: string[];
  onCitiesChange: (cities: string[]) => void;
  disabled?: boolean;
}

export const LocationForm = ({
  query,
  onQueryChange,
  selectedCountry,
  onCountryChange,
  selectedState,
  onStateChange,
  selectedCities,
  onCitiesChange,
  disabled = false,
}: LocationFormProps) => {
  const [cityQuery, setCityQuery] = useState("");

  const allCountries = Country.getAllCountries();
  const allStatesOfCountry = useMemo(
    () => State.getStatesOfCountry(selectedCountry),
    [selectedCountry]
  );
  
  const allCitiesOfState = useMemo(() => {
    const cities = City.getCitiesOfState(selectedCountry, selectedState);
    return cityQuery.length > 0
      ? cities.filter((city) => 
          city.name.toLowerCase().includes(cityQuery.toLowerCase())
        )
      : cities;
  }, [selectedState, selectedCountry, cityQuery]);

  const buildQueries = useMemo(
    () => selectedCities.map((city) => 
      `${query} in ${city}, ${selectedState}, ${selectedCountry}`
    ),
    [query, selectedCities, selectedState, selectedCountry]
  );

  const handleCountryChange = (value: string) => {
    onCountryChange(value);
    onStateChange("");
    onCitiesChange([]);
  };

  const removeCity = (cityToRemove: string) => {
    onCitiesChange(selectedCities.filter((city) => city !== cityToRemove));
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3 flex flex-col">
        <InputWithLabel
          label={{ text: "Query" }}
          forId="Query"
          input={{
            disabled,
            onChange: (e) => onQueryChange(e.target.value),
            placeholder: "Type your query...",
            value: query,
          }}
        />

        <SearchableSelect
          placeholder="Search by country"
          value={selectedCountry}
          disabled={disabled}
          onChange={handleCountryChange}
          options={allCountries.map((c) => ({
            value: c.isoCode,
            label: c.name,
          }))}
        />

        <SearchableSelect
          value={selectedState}
          placeholder="Select a state/province/region/county"
          disabled={!selectedCountry || disabled}
          onChange={onStateChange}
          options={allStatesOfCountry.map((s) => ({
            value: s.isoCode,
            label: s.name,
          }))}
        />

        {allCitiesOfState.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="font-medium">
              Cities of {State.getStateByCodeAndCountry(selectedState, selectedCountry)?.name}
            </span>
            <Badge variant="secondary" className="gap-1">
              <MapPin className="w-4 h-4" />
              <span>{allCitiesOfState.length} locations</span>
            </Badge>
          </div>
        )}

        {!disabled && (
          <Input
            onChange={(e) => setCityQuery(e.target.value)}
            placeholder="Search for cities..."
            disabled={!selectedState}
            value={cityQuery}
          />
        )}

        {selectedCities.length > 0 && (
          <ScrollArea className="h-20">
            <div className="flex flex-wrap gap-2">
              {selectedCities.map((city) => (
                <Badge
                  key={city}
                  onClick={() => removeCity(city)}
                  className="flex items-center gap-1 cursor-pointer hover:opacity-80"
                >
                  {city}
                  <X className="w-3 h-3" />
                </Badge>
              ))}
            </div>
          </ScrollArea>
        )}

        {buildQueries.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium">Build queries</p>
            <ScrollArea className="h-20">
              <div className="space-y-1">
                {buildQueries.map((query) => (
                  <p key={query} className="text-blue-500 underline cursor-pointer text-sm">
                    {query}
                  </p>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

{allCitiesOfState.length > 0 && (
        <ScrollArea className="h-60">
          <div className="grid grid-cols-2 gap-2">
            {allCitiesOfState.map((city) => (
              <CityCheckBox
                key={city.name}
                city={city.name}
                cities={selectedCities}
                setSelectedCities={onCitiesChange}
              />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </ScrollArea>
  );
};
