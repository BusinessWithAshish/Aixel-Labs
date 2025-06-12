import { Dispatch, SetStateAction } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type TCityCheckboxProps = {
  city: string;
  setSelectedCities: Dispatch<SetStateAction<string[]>>;
}

export const CityCheckBox = (props: TCityCheckboxProps) => {

  const { city, setSelectedCities} = props;

  return (
    <div className='flex items-center space-x-2'>
      <Label htmlFor={city}>{city}</Label>
      <Checkbox
        id={city}
        onCheckedChange={(value) => {
          if (value) {
            setSelectedCities(prev => [...prev, city])
          } else {
            setSelectedCities(prev => prev.filter(c => c !== city))
          }
        }}
      />
    </div>
  )
}