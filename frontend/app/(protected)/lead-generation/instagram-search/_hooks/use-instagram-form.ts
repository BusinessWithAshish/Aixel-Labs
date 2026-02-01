'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
    INSTAGRAM_SCRAPE_REQUEST,
    INSTAGRAM_SCRAPE_REQUEST_SCHEMA,
    INSTAGRAM_SCRAPE_RESPONSE,
    INSTAGRAM_SCRAPE_SEARCH_FOR,
    INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO,
} from '@aixellabs/shared/common';
import { API_ENDPOINTS } from '@aixellabs/shared/common';
import { BACKEND_URL } from '@/config/app-config';
import { useMemo, useState } from 'react';

const DummyResponse: INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO[] = [
    {
        id: '1',
        fullName: 'John Doe',
        username: 'john_doe',
        email: 'john_doe@example.com',
        instagramUrl: 'https://www.instagram.com/john_doe/',
        websites: ['https://www.example.com'],
        bio: 'This is a bio',
        bioHashtags: ['#example'],
        bioMentions: ['@example'],
        followers: 100,
        following: 100,
        posts: 100,
        profilePicture: 'https://www.example.com/profile.jpg',
        profilePcitureHd: 'https://www.example.com/profile.jpg',
        isVerified: true,
        isBusiness: true,
        isProfessional: true,
        isPrivate: false,
        isJoinedRecently: false,
        businessEmail: 'john_doe@example.com',
        businessPhoneNumber: '1234567890',
        businessCategoryName: 'Example Category',
        overallCategoryName: 'Example Category',
        businessAddressJson: '{"address": "123 Example St, Anytown, USA"}',
    },
    {
        id: '2',
        fullName: 'Jane Doe',
        username: 'jane_doe',
        email: 'jane_doe@example.com',
        instagramUrl: 'https://www.instagram.com/jane_doe/',
        websites: ['https://www.example.com'],
        bio: 'This is a bio',
        bioHashtags: ['#example'],
        bioMentions: ['@example'],
        followers: 100,
        following: 100,
        posts: 100,
        profilePicture: 'https://www.example.com/profile.jpg',
        profilePcitureHd: 'https://www.example.com/profile.jpg',
        isVerified: true,
        isBusiness: true,
        isProfessional: true,
        isPrivate: false,
        isJoinedRecently: false,
        businessEmail: 'jane_doe@example.com',
        businessPhoneNumber: '1234567890',
        businessCategoryName: 'Example Category',
        overallCategoryName: 'Example Category',
        businessAddressJson: '{"address": "123 Example St, Anytown, USA"}',
    },
    {
        id: '3',
        fullName: 'Jim Doe',
        username: 'jim_doe',
        email: 'jim_doe@example.com',
        instagramUrl: 'https://www.instagram.com/jim_doe/',
        websites: ['https://www.example.com'],
        bio: 'This is a bio',
        bioHashtags: ['#example'],
        bioMentions: ['@example'],
        followers: 100,
        following: 100,
        posts: 100,
        profilePicture: 'https://www.example.com/profile.jpg',
        profilePcitureHd: 'https://www.example.com/profile.jpg',
        isVerified: true,
        isBusiness: true,
        isProfessional: true,
        isPrivate: false,
        isJoinedRecently: false,
        businessEmail: 'jim_doe@example.com',
        businessPhoneNumber: '1234567890',
        businessCategoryName: 'Example Category',
        overallCategoryName: 'Example Category',
        businessAddressJson: '{"address": "123 Example St, Anytown, USA"}',
    },
    {
        id: '4',
        fullName: 'Jill Doe',
        username: 'jill_doe',
        email: 'jill_doe@example.com',
        instagramUrl: 'https://www.instagram.com/jill_doe/',
        websites: ['https://www.example.com'],
        bio: 'This is a bio',
        bioHashtags: ['#example'],
        bioMentions: ['@example'],
        followers: 100,
        following: 100,
        posts: 100,
        profilePicture: 'https://www.example.com/profile.jpg',
        profilePcitureHd: 'https://www.example.com/profile.jpg',
        isVerified: true,
        isBusiness: true,
        isProfessional: true,
        isPrivate: false,
        isJoinedRecently: false,
        businessEmail: 'jill_doe@example.com',
        businessPhoneNumber: '1234567890',
        businessCategoryName: 'Example Category',
        overallCategoryName: 'Example Category',
        businessAddressJson: '{"address": "123 Example St, Anytown, USA"}',
    },
    {
        id: '5',
        fullName: 'Jack Doe',
        username: 'jack_doe',
        email: 'jack_doe@example.com',
        instagramUrl: 'https://www.instagram.com/jack_doe/',
        websites: ['https://www.example.com'],
        bio: 'This is a bio',
        bioHashtags: ['#example'],
        bioMentions: ['@example'],
        followers: 100,
        following: 100,
        posts: 100,
        profilePicture: 'https://www.example.com/profile.jpg',
        profilePcitureHd: 'https://www.example.com/profile.jpg',
        isVerified: true,
        isBusiness: true,
        isProfessional: true,
        isPrivate: false,
        isJoinedRecently: false,
        businessEmail: 'jack_doe@example.com',
        businessPhoneNumber: '1234567890',
        businessCategoryName: 'Example Category',
        overallCategoryName: 'Example Category',
        businessAddressJson: '{"address": "123 Example St, Anytown, USA"}',
    },
    {
        id: '6',
        fullName: 'Jill Doe',
        username: 'jill_doe',
        email: 'jill_doe@example.com',
        instagramUrl: 'https://www.instagram.com/jill_doe/',
        websites: ['https://www.example.com'],
        bio: 'This is a bio',
        bioHashtags: ['#example'],
        bioMentions: ['@example'],
        followers: 100,
        following: 100,
        posts: 100,
        profilePicture: 'https://www.example.com/profile.jpg',
        profilePcitureHd: 'https://www.example.com/profile.jpg',
        isVerified: true,
        isBusiness: true,
        isProfessional: true,
        isPrivate: false,
        isJoinedRecently: false,
        businessEmail: 'jill_doe@example.com',
        businessPhoneNumber: '1234567890',
        businessCategoryName: 'Example Category',
        overallCategoryName: 'Example Category',
        businessAddressJson: '{"address": "123 Example St, Anytown, USA"}',
    },
];

const defaultValues: INSTAGRAM_SCRAPE_REQUEST = {
    searchFor: INSTAGRAM_SCRAPE_SEARCH_FOR.QUERY,
    usernames: [],
    query: 'cafes',
    country: '',
    states: [],
    hashtags: ['#cafe', '#coffee', '#tea'],
    keywords: ['cafe', 'coffee', 'tea'],
    excludeKeywords: ['pizza', 'burger', 'ice cream'],
    excludeHashtags: ['#pizza', '#burger', '#ice cream'],
};

const responseData = {
    founded: DummyResponse.map((lead) => lead.instagramUrl || ''),
    foundedLeadsCount: DummyResponse.length,
    allLeads: DummyResponse,
    allLeadsCount: DummyResponse.length,
} as INSTAGRAM_SCRAPE_RESPONSE;

export const useInstagramForm = () => {
    const [response, setResponse] = useState<INSTAGRAM_SCRAPE_RESPONSE | null>(responseData);
    const form = useForm<INSTAGRAM_SCRAPE_REQUEST>({
        resolver: zodResolver(INSTAGRAM_SCRAPE_REQUEST_SCHEMA as any),
        defaultValues,
    });

    const resultsSectionKey = 'results';

    const isResultsSectionEnabled = useMemo(() => {
        return (
            (response?.foundedLeadsCount && response?.foundedLeadsCount > 0) ||
            (response?.allLeadsCount && response?.allLeadsCount > 0)
        );
    }, [response?.foundedLeadsCount, response?.allLeadsCount]);

    const onSubmit = async (data: INSTAGRAM_SCRAPE_REQUEST) => {
        console.log(data);
        const response = await fetch(`${BACKEND_URL}${API_ENDPOINTS.INSTAGRAM_SCRAPE}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        const responseJson = await response.json();
        console.log('🔍 [Instagram API] Response:', JSON.stringify(responseJson, null, 2));

        // console.log(JSON.stringify(responseData, null, 2));

        setResponse(responseData);
    };

    return {
        form,
        onSubmit,
        resultsSectionKey,
        response,
        isResultsSectionEnabled,
    };
};

export type UseInstagramFormReturn = ReturnType<typeof useInstagramForm>;
