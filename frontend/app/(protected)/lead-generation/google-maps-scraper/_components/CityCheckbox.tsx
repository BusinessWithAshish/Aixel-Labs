import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type TCityCheckboxProps = {
  city: string;
  cities: string[];
  setSelectedCities: (cities: string[]) => void;
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
            setSelectedCities([...cities, city])
          } else {
            setSelectedCities(cities.filter(c => c !== city))
          }
        }}
      />
        <Label htmlFor={city}>{city}</Label>
    </div>
  )
}