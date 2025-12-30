'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { InputWithLabel } from '@/components/wrappers/InputWithLabel';
import { useState } from 'react';
import { X, Plus } from 'lucide-react';

type DirectUrlFormProps = {
    urls: string[];
    onUrlsChange: (urls: string[]) => void;
};

export const DirectUrlForm = ({ urls, onUrlsChange }: DirectUrlFormProps) => {
    const [urlInput, setUrlInput] = useState('');

    const addUrl = () => {
        if (urlInput.trim() && !urls.includes(urlInput.trim())) {
            onUrlsChange([...urls, urlInput.trim()]);
            setUrlInput('');
        }
    };

    const removeUrl = (urlToRemove: string) => {
        onUrlsChange(urls.filter((url) => url !== urlToRemove));
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addUrl();
        }
    };

    return (
        <ScrollArea className="h-full">
            <div className="space-y-4 p-3 flex flex-col">
                <InputWithLabel
                    label={{ text: 'Google Maps URL or Place ID' }}
                    forId="url-input"
                    input={{
                        onChange: (e) => setUrlInput(e.target.value),
                        placeholder: 'Enter Google Maps URL or Place ID...',
                        value: urlInput,
                        onKeyPress: handleKeyPress,
                    }}
                />

                <Button onClick={addUrl} disabled={!urlInput.trim()} className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add URL
                </Button>

                {urls.length > 0 && (
                    <>
                        <div className="flex items-center justify-between">
                            <span className="font-medium">Added URLs</span>
                            <Badge variant="secondary">{urls.length} URL(s)</Badge>
                        </div>

                        <ScrollArea className="h-fit max-h-96">
                            <div className="flex flex-col gap-2">
                                {urls.map((url, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                                    >
                                        <span className="text-sm truncate flex-1 mr-2">{url}</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeUrl(url)}
                                            className="h-8 w-8 p-0"
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </>
                )}

                {urls.length > 0 && (
                    <div className="text-sm text-green-600 font-medium">✓ Direct URL form is ready to submit</div>
                )}
            </div>
        </ScrollArea>
    );
};
