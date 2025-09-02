import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import { City, Country, State } from "country-state-city";
import { z } from "zod";
import { CityCheckBox } from "@/app/LGS/_components/CityCheckbox";
import { Button } from "@/components/ui/button";
import {SearchableSelect} from "@/components/ui/searchable-select";
import {Badge} from "@/components/ui/badge";
import {MapPin, X} from "lucide-react";

export const GenerateLeads = () => {

  const [country, setCountry] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const allCountries = Country.getAllCountries();
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [cityQuery, setCityQuery] = useState<string>('');

  const allStatesOfCountry = useMemo(
    () => State.getStatesOfCountry(country),
    [country]
  );

  const allCitiesOfState = useMemo(
    () => {
      if(cityQuery.length > 0) {
        return City
          .getCitiesOfState(country, selectedState)
          .filter(city => city.name.toLowerCase().includes(cityQuery.toLowerCase()));
      }
      else {
        return City.getCitiesOfState(country, selectedState);
      }
      },
    [selectedState, country, cityQuery]
  );

  const handleSendCountryToGetStates = async () => {

    const querySchema = z.object({
      query: z.string(),
      country: z.string(),
      states: z.array(z.object({
        name: z.string(),
        cities: z.array(z.string())
      }))
    });

    if (!country && !selectedState && !query && !selectedCities.length) {
      alert("Please select a country, state and query");
      return;
    }

    try {
      setIsLoading(true);
      const backendURL = new URL(`${process.env.NEXT_PUBLIC_AIXELLABS_BE_URL}/gmaps/scrape/`);

      const queryData = {
        query: query,
        country: Country.getCountryByCode(country)?.name,
        states: [{
          name: State.getStateByCode(selectedState)?.name,
          cities: selectedCities
        } ]
      }

      console.log('backendURL', backendURL.toString());
      console.log('queryData', queryData);

      if (!querySchema.safeParse(queryData).success) {
        alert('Failed to parse query');
        return;
      }

      const response = await fetch(backendURL.toString(), {
        method: "POST",
        body: JSON.stringify(queryData),
        headers: {
          "Content-Type": "application/json"
        }
      });

      return await response.json();
    } catch (error) {
      console.error("Failed to POST:", error);
      return {}
    }
    finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>

      <CardHeader className='flex gap-2 items-center justify-between'>
        <span>Generate Leads</span>

        { }
        <Button
            disabled={isLoading || !selectedCities.length}
            onClick={handleSendCountryToGetStates}
        >
          {!isLoading ? "Start scraping" : "Scraping..."}
        </Button>

      </CardHeader>

      <CardContent className='flex flex-wrap gap-4'>

        {/* QUERY */}
        <Input
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type your query..."
          className='w-full'
          value={query}
        />

        {/* COUNTRY DROPDOWN */}
        <SearchableSelect
            className='w-full'
            value={country}
            onChange={(value) => {
              setCountry(value);
              setSelectedState('')
            }
        }
            options={allCountries.map(country => ({
          value: country.isoCode,
          label: country.name
        }))} />

        {/* STATE DROPDOWN */}
        <SearchableSelect
            className='w-full'
            value={selectedState}
            disabled={!country}
            onChange={(value) => setSelectedState(value)}
            options={allStatesOfCountry.map(country => ({
              value: country.isoCode,
              label: country.name
            }))}
        />

      </CardContent>

      <CardFooter className='flex-col items-start justify-between gap-4'>

        <div className='w-full flex flex-wrap gap-4 justify-between items-center'>
          {allCitiesOfState.length > 0 && (
              <span className='font-medium text-xl'>Cities of {State.getStateByCodeAndCountry(selectedState, country)?.name}</span>
          )}
          <Badge>
            <MapPin />
            <span>Available locations: {allCitiesOfState.length}</span>
            </Badge>
        </div>


        {/* SEARCH CITIES */}
        <Input
          onChange={(e) => setCityQuery(e.target.value)}
          placeholder="Search for cities..."
          className='w-full'
          disabled={!selectedState}
          value={cityQuery}
        />

        {/*{console.log('-->', selectedCities)}*/}

        {selectedCities.length > 0 && (
            selectedCities.map(city => (
                <Badge onClick={() => {
                  setSelectedCities((prevState) => prevState.filter(c => c !== city));
                }} className='flex hover:opacity-80 cursor-pointer justify-between items-center w-fit gap-2' key={city}>
                  {city}
                  <X  />
                </Badge>
            ))
        )}

        <div className='flex flex-wrap h-[500px] overflow-auto gap-6'>
          {allCitiesOfState.map(city => (
            <CityCheckBox key={city.name} city={city.name} setSelectedCities={setSelectedCities} />
          ))}
        </div>

      </CardFooter>

    </Card>
  )

}