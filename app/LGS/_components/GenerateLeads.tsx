import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { City, Country, State } from "country-state-city";
import { z } from "zod";
import { CityCheckBox } from "@/app/LGS/_components/CityCheckbox";
import { Button } from "@/components/ui/button";

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
      const backendURL = new URL(process.env.NEXT_PUBLIC_AIXELLABS_BE_URL as string);

      const queryData = {
        query: query,
        country: country,
        states: [{
          name: selectedState,
          cities: selectedCities
        } ]
      }

      console.log('backendURL', backendURL);
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

      <CardHeader>Generate Leads</CardHeader>

      <CardContent className='flex flex-wrap gap-4'>

        <Input
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type your query..."
          className='max-w-sm'
          value={query}
        />


        <Select onValueChange={(value) => {
          setCountry(value)
          setSelectedState('')
        }}>
          <SelectTrigger className='min-w-md'>
            <SelectValue placeholder="Select a country..." />
          </SelectTrigger>
          <SelectContent>
            {allCountries.map(country => (
              <SelectItem
                key={country.isoCode}
                value={country.isoCode}
              >
                {country.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select disabled={!country} onValueChange={(value) => setSelectedState(value)}>
          <SelectTrigger className='min-w-md'>
            <SelectValue placeholder="Select a state..." />
          </SelectTrigger>
          <SelectContent>
            {allStatesOfCountry.map(state => (
              <SelectItem
                key={state.isoCode}
                value={state.isoCode}
              >
                {state.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

      </CardContent>

      <CardFooter className='flex-col items-start justify-between gap-4'>

        {allCitiesOfState.length > 0 && (
          <span className='font-medium text-xl'>Cities of {selectedState}</span>
        )}

        <Input
          onChange={(e) => setCityQuery(e.target.value)}
          placeholder="Search for cities..."
          className='max-w-sm'
          disabled={!selectedState}
          value={cityQuery}
        />


        <div className='flex flex-wrap gap-6'>
          {allCitiesOfState.map(city => (
            <CityCheckBox key={city.name} city={city.name} setSelectedCities={setSelectedCities} />
          ))}
        </div>

        <Button
          disabled={isLoading || !selectedCities.length}
          onClick={handleSendCountryToGetStates}
        >
          {!isLoading ? "Start scraping" : "Scraping..."}
        </Button>
      </CardFooter>

    </Card>
  )

}