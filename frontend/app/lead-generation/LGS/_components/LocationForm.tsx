'use client';

import { useState, useMemo } from 'react';
import { Country, State, City } from 'country-state-city';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { InputWithLabel } from '@/components/wrappers/InputWithLabel';
import { CityCheckBox } from './CityCheckbox';
import { useForm } from '../_contexts';
import { MapPin, X } from 'lucide-react';

export const LocationForm = () => {
    const { formData, updateFormData } = useForm();
    const [cityQuery, setCityQuery] = useState('');

    const allCountries = Country.getAllCountries();
    const allStatesOfCountry = useMemo(() => State.getStatesOfCountry(formData.country || ''), [formData.country]);

    const allCitiesOfState = useMemo(() => {
        if (!formData.country || !formData.states) return [];
        const cities = City.getCitiesOfState(formData.country, formData.states[0].name);
        return cityQuery.length > 0
            ? cities.filter((city) => city.name.toLowerCase().includes(cityQuery.toLowerCase()))
            : cities;
    }, [formData.states, formData.country, cityQuery]);

    const handleCountryChange = (value: string) => {
        updateFormData({
            country: value,
            states: [],
        });
    };

    const handleStateChange = (value: string) => {
        updateFormData({
            states: [{ name: value, cities: [] }],
        });
    };

    const handleCitiesChange = (cities: string[]) => {
        updateFormData({ states: [{ name: formData.states[0].name, cities: cities }] });
    };

    const removeCity = (cityToRemove: string) => {
        const updatedCities = (formData.states[0].cities || []).filter((city: string) => city !== cityToRemove);
        updateFormData({ states: [{ name: formData.states[0].name, cities: updatedCities }] });
    };

    return (
        <ScrollArea className="h-full">
            <div className="space-y-4 p-3 flex flex-col">
                {/* Query Input */}
                <InputWithLabel
                    label={{ text: 'Query' }}
                    forId="Query"
                    input={{
                        onChange: (e) => updateFormData({ query: e.target.value }),
                        placeholder: 'Type your query...',
                        value: formData.query,
                    }}
                />

                {/* Country Selection */}
                <SearchableSelect
                    placeholder="Search by country"
                    value={formData.country}
                    onChange={handleCountryChange}
                    options={allCountries.map((c) => ({
                        value: c.isoCode,
                        label: c.name,
                    }))}
                />

                {/* State Selection */}
                <SearchableSelect
                    value={formData.states[0].name}
                    placeholder="Select a state/province/region/county"
                    disabled={!formData.country}
                    onChange={handleStateChange}
                    options={allStatesOfCountry.map((s) => ({
                        value: s.isoCode,
                        label: s.name,
                    }))}
                />

                {/* Cities Header */}
                {allCitiesOfState.length > 0 && (
                    <div className="flex items-center justify-between">
                        <span className="font-medium">
                            Cities of{' '}
                            {State.getStateByCodeAndCountry(formData.states[0].name || '', formData.country || '')?.name}
                        </span>
                        <Badge variant="secondary" className="gap-1">
                            <MapPin className="w-4 h-4" />
                            <span>{allCitiesOfState.length} locations</span>
                        </Badge>
                    </div>
                )}

                {/* City Search */}
                <Input
                    onChange={(e) => setCityQuery(e.target.value)}
                    placeholder="Search for cities..."
                    disabled={!formData.states[0].name}
                    value={cityQuery}
                />

                {/* Selected Cities */}
                {(formData.states[0].cities?.length ?? 0) > 0 && (
                    <ScrollArea className="h-fit">
                        <div className="flex flex-wrap gap-2">
                            {(formData.states[0].cities || []).map((city: string) => (
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

                {/* Cities List */}
                {allCitiesOfState.length > 0 && (
                    <ScrollArea className="h-56">
                        <div className="grid grid-cols-2 gap-2">
                            {allCitiesOfState.map((city) => (
                                <CityCheckBox
                                    key={city.name}
                                    city={city.name}
                                    cities={formData.states[0].cities || []}
                                    setSelectedCities={handleCitiesChange}
                                />
                            ))}
                        </div>
                    </ScrollArea>
                )}

                {/* Form Status */}
                {formData.states.length > 0 && formData.states[0].cities.length > 0 && (
                    <div className="text-sm text-green-600 font-medium">✓ Location form is ready to submit</div>
                )}
            </div>
        </ScrollArea>
    );
};
