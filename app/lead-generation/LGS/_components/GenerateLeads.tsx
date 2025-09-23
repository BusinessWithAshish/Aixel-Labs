"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLeadGenerationForm } from "../_hooks/useLeadGenerationForm";
import { useUnifiedLeadStreaming } from "../_hooks/useUnifiedLeadStreaming";
import { LocationForm } from "./LocationForm";
import { IdUrlForm } from "./IdUrlForm";
import { ConnectionConfig } from "./ConnectionConfig";
import { UnifiedStreamingProgress } from "./UnifiedStreamingProgress";
import { ResultsSection } from "./ResultsSection";
import { Power, PowerOff, Settings } from "lucide-react";


export const GenerateLeads = () => {
    const {
        formState,
        updateFormState,
        isSubmitDisabled,
    } = useLeadGenerationForm();

    const {
        streamingState,
        ec2State,
        connectionConfig,
        startStreaming,
        resetStreaming,
        stopEC2Instance,
        isFormDisabled,
        getButtonText,
    } = useUnifiedLeadStreaming();

    const handleStartScraping = async () => {
        await startStreaming({
            query: formState.query,
            selectedCountry: formState.selectedCountry,
            selectedState: formState.selectedState,
            selectedCities: formState.selectedCities,
        });
    };

    const handleStopEC2 = async () => {
        await stopEC2Instance();
        resetStreaming();
    };

    const isEC2Ready = connectionConfig.useAWS && ec2State.currentPhase === 'ready' && ec2State.progress === 100;

    return (
        <div className="space-y-4">
            {/* Connection Configuration */}
            <ConnectionConfig />

            <Card>
                <CardHeader className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <CardTitle>📍 Generate Google Map Leads</CardTitle>
                        {isEC2Ready && (
                            <div className="flex items-center gap-2 text-sm text-green-600">
                                <Power className="w-4 h-4" />
                                <span>EC2 Ready</span>
                            </div>
                        )}
                        {connectionConfig.useLocalDev && (
                            <div className="flex items-center gap-2 text-sm text-green-600">
                                <Settings className="w-4 h-4" />
                                <span>Local Dev</span>
                            </div>
                        )}
                        {!connectionConfig.useLocalDev && !connectionConfig.useAWS && connectionConfig.isConfigValid && (
                            <div className="flex items-center gap-2 text-sm text-blue-600">
                                <Settings className="w-4 h-4" />
                                <span>Manual Mode</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {isEC2Ready && (
                            <Button 
                                variant="outline"
                                size="sm"
                                onClick={handleStopEC2}
                                disabled={isFormDisabled}
                            >
                                <PowerOff className="w-4 h-4 mr-2" />
                                Stop EC2
                            </Button>
                        )}
                        <Button 
                            disabled={isSubmitDisabled || isFormDisabled} 
                            onClick={handleStartScraping}
                        >
                            {getButtonText()}
                        </Button>
                    </div>
                </CardHeader>

            <CardContent className="grid grid-cols-1 h-full lg:grid-cols-2 gap-2 p-3">
                <LocationForm
                    query={formState.query}
                    onQueryChange={(query) => updateFormState({ query })}
                    selectedCountry={formState.selectedCountry}
                    onCountryChange={(selectedCountry) => updateFormState({ 
                        selectedCountry, 
                        selectedState: "", 
                        selectedCities: [] 
                    })}
                    selectedState={formState.selectedState}
                    onStateChange={(selectedState) => updateFormState({ 
                        selectedState, 
                        selectedCities: [] 
                    })}
                    selectedCities={formState.selectedCities}
                    onCitiesChange={(selectedCities) => updateFormState({ selectedCities })}
                    disabled={isFormDisabled || formState.idsUrls.length > 0}
                />

                <IdUrlForm
                    idsUrls={formState.idsUrls}
                    onIdsUrlsChange={(idsUrls) => {
                        updateFormState({ idsUrls });
                        if (idsUrls.length === 0) {
                            updateFormState({
                                query: "",
                                selectedCountry: "",
                                selectedState: "",
                                selectedCities: [],
                            });
                        }
                    }}
                    disabled={isFormDisabled || !!formState.query}
                />
            </CardContent>

                <CardContent className="space-y-4">
                    <UnifiedStreamingProgress 
                        isStreaming={streamingState.isStreaming} 
                        streamData={streamingState.streamData} 
                        currentPhase={streamingState.currentPhase}
                        useLocalDev={connectionConfig.useLocalDev}
                        useAWS={connectionConfig.useAWS}
                        ec2Phase={ec2State.currentPhase}
                        ec2Message={ec2State.message}
                        ec2Progress={ec2State.progress}
                        ec2Error={ec2State.error}
                        beUrl={connectionConfig.beUrl}
                    />
                    <ResultsSection data={streamingState.data} />
                </CardContent>
            </Card>
        </div>
    );
};
