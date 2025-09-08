"use client";

import {useMemo, useState} from "react";
import {City, Country, State} from "country-state-city";
import {z} from "zod";
import {cn} from "@/lib/utils";
import {getBeUrl} from "@/helpers/get-be-url";

import {Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {SearchableSelect} from "@/components/ui/searchable-select";
import {Badge} from "@/components/ui/badge";
import {Separator} from "@/components/ui/separator";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Tabs, TabsList, TabsTrigger, TabsContent} from "@/components/ui/tabs";
import {InputWithLabel} from "@/components/wrappers/InputWithLabel";
import {CityCheckBox} from "@/app/lead-generation/LGS/_components/CityCheckbox";

import {MapPin, X, SortAsc, SortDesc} from "lucide-react";
import {GmapsData, TGmapsScrapeResult} from "@/app/lead-generation/LGS/utlis/types";

// ---------- Lead Card ----------
const LeadCard = ({lead}: { lead: GmapsData["actualLeads"][0] }) => {
    const getBgColor = () => {
        if (!lead.website && lead.phoneNumber) return "bg-green-100"; // Hot lead
        if (lead.website && lead.phoneNumber) return "bg-amber-100"; // Warm lead
        if (!lead.website && !lead.phoneNumber) return "bg-gray-100"; // Cold lead
        return "bg-white";
    };

    return (
        <Card className={cn("gap-2 hover:shadow-md cursor-pointer", getBgColor())}>
            <CardHeader>
                <CardTitle>{lead.name}</CardTitle>
                <CardDescription>{lead.numberOfReviews} reviews</CardDescription>
                <CardAction>⭐ {lead.overAllRating}</CardAction>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-2">
                    🌐
                    <p
                        onClick={() => lead.website && window.location.assign(lead.website)}
                        className={cn(
                            "truncate font-medium",
                            lead.website ? "text-blue-500 cursor-pointer underline" : "text-red-500"
                        )}
                    >
                        {lead.website || "No website"}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    📱 <p className="truncate">{lead.phoneNumber || "No phone number"}</p>
                </div>
            </CardContent>
        </Card>
    );
};

// ---------- Results Section ----------
export const ResultsSection = ({data}: { data?: TGmapsScrapeResult }) => {
    const [sortKey, setSortKey] = useState<"rating" | "reviews">("rating");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    const leads = useMemo(() => data?.data?.actualLeads ?? [], [data?.data?.actualLeads]);

    const sortedLeads = useMemo(() => {
        return [...leads].sort((a, b) => {
            const aVal = sortKey === "rating" ? parseFloat(a.overAllRating) : parseInt(a.numberOfReviews);
            const bVal = sortKey === "rating" ? parseFloat(b.overAllRating) : parseInt(b.numberOfReviews);
            return sortDir === "asc" ? aVal - bVal : bVal - aVal;
        });
    }, [leads, sortKey, sortDir]);

    const grouped = {
        all: sortedLeads,
        noWebsiteNoPhone: sortedLeads.filter((l) => !l.website && !l.phoneNumber),
        noWebsiteYesPhone: sortedLeads.filter((l) => !l.website && l.phoneNumber),
        yesWebsiteYesPhone: sortedLeads.filter((l) => l.website && l.phoneNumber),
    };

    const renderTabContent = (leads: typeof sortedLeads) => (
        <ScrollArea className="h-[500px]">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {leads.map((lead) => (
                    <LeadCard key={lead.id} lead={lead}/>
                ))}
            </div>
        </ScrollArea>
    );

    return (
        <div className="p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Results</h2>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSortKey(sortKey === "rating" ? "reviews" : "rating")}
                    >
                        Sort by: {sortKey === "rating" ? "⭐ Rating" : "📝 Reviews"}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                    >
                        {sortDir === "asc" ? <SortAsc className="w-5 h-5"/> : <SortDesc className="w-5 h-5"/>}
                    </Button>
                </div>
            </div>

            <Separator/>

            <Tabs defaultValue="all" className="w-full ">
                <TabsList className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 h-fit w-full">
                    <TabsTrigger value="all">All Leads</TabsTrigger>
                    <TabsTrigger value="noWebsiteYesPhone">No Website + Phone</TabsTrigger>
                    <TabsTrigger value="yesWebsiteYesPhone">Website + Phone</TabsTrigger>
                    <TabsTrigger value="noWebsiteNoPhone">No Website & No Phone</TabsTrigger>
                </TabsList>

                <TabsContent value="all">{renderTabContent(grouped.all)}</TabsContent>
                <TabsContent value="noWebsiteYesPhone">{renderTabContent(grouped.noWebsiteYesPhone)}</TabsContent>
                <TabsContent value="yesWebsiteYesPhone">{renderTabContent(grouped.yesWebsiteYesPhone)}</TabsContent>
                <TabsContent value="noWebsiteNoPhone">{renderTabContent(grouped.noWebsiteNoPhone)}</TabsContent>
            </Tabs>
        </div>
    );
};

// ---------- Dummy Data ----------
const dummyData: TGmapsScrapeResult = {
    success: true,
    data: {
        foundedLeads: ["wjdkejd"],
        foundedLeadsCount: 1,
        actualLeadsCount: 1,
        actualLeads: [
            {
                name: "Lil Italy",
                numberOfReviews: "200",
                overAllRating: "3.4",
                website: "https://www.doesthispersonexists.com",
                phoneNumber: "+2138209302",
                id: "1",
            },
        ],
    },
};

// ---------- Main Page ----------
export const GenerateLeads = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [query, setQuery] = useState("");
    const [selectedCountry, setSelectedCountry] = useState("");
    const [selectedState, setSelectedState] = useState("");
    const [cityQuery, setCityQuery] = useState("");
    const [selectedCities, setSelectedCities] = useState<string[]>([]);
    const [idsUrls, setIdUrls] = useState<string[]>([]);
    const [data, setData] = useState<TGmapsScrapeResult>(dummyData);

    const allCountries = Country.getAllCountries();
    const allStatesOfCountry = useMemo(() => State.getStatesOfCountry(selectedCountry), [selectedCountry]);
    const allCitiesOfState = useMemo(() => {
        const cities = City.getCitiesOfState(selectedCountry, selectedState);
        return cityQuery.length > 0
            ? cities.filter((city) => city.name.toLowerCase().includes(cityQuery.toLowerCase()))
            : cities;
    }, [selectedState, selectedCountry, cityQuery]);

    const buildQueries = useMemo(
        () => selectedCities.map((city) => `${query} in ${city}, ${selectedState}, ${selectedCountry}`) ?? [],
        [query, selectedCities, selectedState, selectedCountry]
    );

    const handleSendCountryToGetStates = async () => {
        const querySchema = z.object({
            query: z.string(),
            country: z.string(),
            states: z.array(z.object({name: z.string(), cities: z.array(z.string())})),
        });

        if (!selectedCountry || !selectedState || !query || !selectedCities.length) {
            alert("Please select a country, state, query, and cities");
            return;
        }

        try {
            setIsLoading(true);
            const backendURL = getBeUrl("/gmaps/scrape/");
            const queryData = {
                query,
                country: Country.getCountryByCode(selectedCountry)?.name,
                states: [{
                    name: State.getStateByCodeAndCountry(selectedState, selectedCountry)?.name,
                    cities: selectedCities
                }],
            };

            if (!querySchema.safeParse(queryData).success) {
                alert("Failed to parse query");
                return;
            }

            const response = await fetch(backendURL.toString(), {
                method: "POST",
                body: JSON.stringify(queryData),
                headers: {"Content-Type": "application/json"},
            });

            const resData = (await response.json()) as TGmapsScrapeResult;
            setData(resData);
        } catch (error) {
            console.error("Failed to POST:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const isSubmitDisabled = useMemo(() => {
        return isLoading || (selectedCities.length < 0 && idsUrls.length < 0);
    }, [isLoading, selectedCities, idsUrls]);

    const containerClassName = "flex flex-col p-3 gap-3 border rounded-md h-full";

    return (
        <Card>
            <CardHeader className="flex items-center justify-between">
                <CardTitle>📍 Generate Google Map Leads</CardTitle>
                <Button disabled={isSubmitDisabled} onClick={handleSendCountryToGetStates}>
                    {!isLoading ? "Start scraping" : "Scraping..."}
                </Button>
            </CardHeader>

            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* FORM 1 */}
                <ScrollArea>
                    <div className={containerClassName}>

                        <InputWithLabel
                            label={{text: "Query"}}
                            forId="Query"
                            input={{
                                disabled: idsUrls.length > 0,
                                onChange: (e) => setQuery(e.target.value),
                                placeholder: "Type your query...",
                                value: query,
                            }}
                        />

                        <SearchableSelect
                            placeholder="Search by country"
                            value={selectedCountry}
                            disabled={idsUrls.length > 0}
                            onChange={(value) => {
                                setSelectedCountry(value);
                                setSelectedState("");
                            }}
                            options={allCountries.map((c) => ({value: c.isoCode, label: c.name}))}
                        />

                        <SearchableSelect
                            value={selectedState}
                            placeholder="Select a state/province/region/county"
                            disabled={!selectedCountry || idsUrls.length > 0}
                            onChange={(value) => setSelectedState(value)}
                            options={allStatesOfCountry.map((s) => ({value: s.isoCode, label: s.name}))}
                        />


                        <div className="flex w-full items-center justify-between">
                            {allCitiesOfState.length > 0 && (
                                <span className="font-medium">
                  Cities of {State.getStateByCodeAndCountry(selectedState, selectedCountry)?.name}
                </span>
                            )}
                            <Badge variant="secondary" className="gap-1">
                                <MapPin className="w-4 h-4"/>
                                <span>{allCitiesOfState.length} locations</span>
                            </Badge>
                        </div>

                        {idsUrls.length <= 0 && (
                            <Input
                                onChange={(e) => setCityQuery(e.target.value)}
                                placeholder="Search for cities..."
                                disabled={!selectedState}
                                value={cityQuery}
                            />
                        )}

                        <ScrollArea>
                            {selectedCities.map((city) => (
                                <Badge
                                    key={city}
                                    onClick={() => setSelectedCities((prev) => prev.filter((c) => c !== city))}
                                    className="flex my-2 items-center gap-1 cursor-pointer hover:opacity-80"
                                >
                                    {city}
                                    <X className="w-3 h-3"/>
                                </Badge>
                            ))}
                        </ScrollArea>

                        {buildQueries.length > 0 && (
                            <>
                                <p>Build queries</p>
                                <ScrollArea>
                                    {buildQueries.map((q) => (
                                        <p key={q} className="text-blue-500 underline cursor-pointer">
                                            {q}
                                        </p>
                                    ))}
                                </ScrollArea>
                            </>
                        )}

                        <ScrollArea>
                            <div className="grid grid-cols-2 gap-3">
                                {allCitiesOfState.map((city) => (
                                    <CityCheckBox
                                        key={city.name}
                                        city={city.name}
                                        cities={selectedCities}
                                        setSelectedCities={setSelectedCities}
                                    />
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </ScrollArea>

                {/* FORM 2 */}
                <ScrollArea>
                    <div className={containerClassName}>
                        <InputWithLabel
                            label={{text: "Comma separated ID(s) or URL(s)"}}
                            forId="idsUrls"
                            input={{
                                disabled: !!query,
                                onChange: (e) => {
                                    if (!e.target.value) {
                                        setQuery("");
                                        setSelectedState("");
                                        setCityQuery("");
                                        setSelectedCountry("");
                                        setSelectedCities([]);
                                        setIdUrls([]);
                                        return;
                                    }
                                    setIdUrls(e.target.value.split(",").map((idUrl) => idUrl.trim()));
                                },
                                placeholder: "Google maps Place ID(s) or URL(s)...",
                                value: idsUrls,
                            }}
                        />
                    </div>
                </ScrollArea>
            </CardContent>

            <div className="p-3 flex flex-col gap-3">
                <ResultsSection data={data}/>
            </div>
        </Card>
    );
};
