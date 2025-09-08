import { Dispatch, SetStateAction } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type TCityCheckboxProps = {
  city: string;
  cities: string[];
  setSelectedCities: Dispatch<SetStateAction<string[]>>;
}

export const CityCheckBox = (props: TCityCheckboxProps) => {

  const { city, setSelectedCities, cities} = props;

  return (
    <div className='flex gap-2 flex-row '>
        <Checkbox
        id={city}
        checked={cities.includes(city)}
        onCheckedChange={(value) => {
          if (value) {
            setSelectedCities(prev => [...prev, city])
          } else {
            setSelectedCities(prev => prev.filter(c => c !== city))
          }
        }}
      />
        <Label htmlFor={city}>{city}</Label>
    </div>
  )
}