'use client';

import PageLayout from '@/components/common/PageLayout';
import { Button } from '@/components/ui/button';

import { BACKEND_URL } from '@/config/app-config';
import { INSTAGRAM_SCRAPE_REQUEST, INSTAGRAM_SCRAPE_SEARCH_FOR } from '@aixellabs/shared/common';
import { API_ENDPOINTS } from '@aixellabs/shared/common/utils';

export default function InstagramPage() {
    return (
        <PageLayout title="Instagram">
            <Button
                onClick={async () => {
                    const requestData: INSTAGRAM_SCRAPE_REQUEST = {
                        searchFor: INSTAGRAM_SCRAPE_SEARCH_FOR.QUERY,
                    };

                    await fetch(`${BACKEND_URL}${API_ENDPOINTS.INSTAGRAM_SCRAPE}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(requestData),
                        credentials: 'include',
                    });
                }}
            >
                Scrape sample v1
            </Button>
        </PageLayout>
    );
}


