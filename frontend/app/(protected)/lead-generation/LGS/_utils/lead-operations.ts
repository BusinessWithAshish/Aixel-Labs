import { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/apis';

// ============================================================================
// Type Definitions
// ============================================================================

export type SortKey = 'rating' | 'reviews';
export type SortDirection = 'asc' | 'desc';

export type LeadCategory = 'hotLeads' | 'warmLeads' | 'coldLeads';

export type LeadType = {
    type: 'Hot Lead' | 'Warm Lead' | 'Cold Lead' | 'Unknown';
    color: string;
    category: LeadCategory;
};

export type CategorizedLeads = {
    all: GMAPS_SCRAPE_LEAD_INFO[];
    hotLeads: GMAPS_SCRAPE_LEAD_INFO[];
    warmLeads: GMAPS_SCRAPE_LEAD_INFO[];
    coldLeads: GMAPS_SCRAPE_LEAD_INFO[];
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if a URL is a social media platform URL
 * Supports: Instagram, Facebook, Twitter/X, LinkedIn, TikTok, YouTube, Pinterest, Snapchat
 */
export const isSocialMediaUrl = (url: string): boolean => {
    if (!url || url === 'N/A' || url.trim() === '') {
        return false;
    }
    
    const socialMediaDomains = [
        'instagram.com',
        'facebook.com',
        'fb.com',
        'twitter.com',
        'x.com',
        'linkedin.com',
        'tiktok.com',
        'youtube.com',
        'youtu.be',
        'pinterest.com',
        'snapchat.com',
    ];
    
    try {
        const urlLower = url.toLowerCase();
        return socialMediaDomains.some(domain => 
            urlLower.includes(domain)
        );
    } catch {
        return false;
    }
};

/**
 * Checks if a lead has a valid website (excluding social media URLs)
 */
export const hasWebsite = (lead: GMAPS_SCRAPE_LEAD_INFO): boolean => {
    const website = lead.website?.trim();
    if (!website || website === 'N/A') {
        return false;
    }
    // If it's a social media URL, we don't consider it as having a website
    return !isSocialMediaUrl(website);
};

/**
 * Checks if a lead has a social media profile
 */
export const hasSocialMedia = (lead: GMAPS_SCRAPE_LEAD_INFO): boolean => {
    const website = lead.website?.trim();
    if (!website || website === 'N/A') {
        return false;
    }
    return isSocialMediaUrl(website);
};

/**
 * Checks if a lead has a valid phone number
 */
export const hasPhone = (lead: GMAPS_SCRAPE_LEAD_INFO): boolean => {
    const phoneNumber = lead.phoneNumber?.trim();
    return !!(phoneNumber && phoneNumber !== 'N/A');
};

/**
 * Extracts numeric value from a string, handling N/A and invalid values
 * @param value - The string value to extract a number from
 * @param isRating - Whether this is a rating (float) or count (integer)
 * @returns The numeric value, or -1 if invalid/missing
 */
export const extractNumericValue = (value: string, isRating: boolean): number => {
    if (!value || value === 'N/A' || value === '' || value === null || value === undefined) {
        return -1;
    }
    
    const stringValue = String(value);
    const normalized = stringValue.replace(/[^\d.]/g, '');
    
    if (!normalized || normalized === '') {
        return -1;
    }
    
    const numeric = isRating ? parseFloat(normalized) : parseInt(normalized, 10);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : -1;
};

// ============================================================================
// Sorting Functions
// ============================================================================

/**
 * Sorts leads by rating or number of reviews
 * @param leads - Array of leads to sort
 * @param sortKey - The field to sort by ('rating' or 'reviews')
 * @param sortDirection - Sort direction ('asc' or 'desc')
 * @returns Sorted array of leads
 */
export const sortLeads = (
    leads: GMAPS_SCRAPE_LEAD_INFO[], 
    sortKey: SortKey, 
    sortDirection: SortDirection
): GMAPS_SCRAPE_LEAD_INFO[] => {
    const isRating = sortKey === 'rating';
    
    return [...leads].sort((a, b) => {
        const aValue = extractNumericValue(
            isRating ? a.overAllRating : a.numberOfReviews, 
            isRating
        );
        const bValue = extractNumericValue(
            isRating ? b.overAllRating : b.numberOfReviews, 
            isRating
        );
        
        // Handle invalid/missing values - put them at the end
        if (aValue === -1 && bValue === -1) return 0;
        if (aValue === -1) return 1;
        if (bValue === -1) return -1;
        
        const comparison = aValue - bValue;
        return sortDirection === 'asc' ? comparison : -comparison;
    });
};

// ============================================================================
// Categorization Functions
// ============================================================================

/**
 * Categorizes leads into hot, warm, and cold based on website, social media, and phone availability
 * - Hot Leads: (No website but has phone) OR (Has social media and phone) - high priority for outreach
 * - Warm Leads: Has proper website (with or without phone) - good for follow-up
 * - Cold Leads: Everything else (no website, no social media, or social media without phone) - low priority
 * 
 * @param leads - Array of leads to categorize
 * @returns Object with categorized lead arrays
 */
export const categorizeLeads = (leads: GMAPS_SCRAPE_LEAD_INFO[]): CategorizedLeads => {
    return {
        all: leads,
        hotLeads: leads.filter((lead) => {
            const hasProperWebsite = hasWebsite(lead);
            const hasSocialMediaProfile = hasSocialMedia(lead);
            const hasPhoneNumber = hasPhone(lead);
            
            // Hot leads are those who:
            // 1. Don't have a website but have a phone, OR
            // 2. Have social media profile and phone (instead of proper website)
            return (!hasProperWebsite && hasPhoneNumber) || (hasSocialMediaProfile && hasPhoneNumber);
        }),
        warmLeads: leads.filter((lead) => {
            const hasProperWebsite = hasWebsite(lead);
            
            // Warm leads are those who have a proper website (regardless of phone)
            return hasProperWebsite;
        }),
        coldLeads: leads.filter((lead) => {
            const hasProperWebsite = hasWebsite(lead);
            const hasSocialMediaProfile = hasSocialMedia(lead);
            const hasPhoneNumber = hasPhone(lead);
            
            // Cold leads are those who:
            // 1. Don't have a website, don't have social media, and don't have phone, OR
            // 2. Have social media but no phone (can't reach them easily)
            return (!hasProperWebsite && !hasSocialMediaProfile && !hasPhoneNumber) || 
                   (hasSocialMediaProfile && !hasPhoneNumber);
        }),
    };
};

/**
 * Determines the lead type for a single lead
 * This is consistent with the categorization logic used in categorizeLeads
 * 
 * Priority order:
 * 1. Hot Lead: No website but has phone OR social media with phone
 * 2. Warm Lead: Has proper website (regardless of phone)
 * 3. Cold Lead: Everything else (no website/social, or social without phone)
 * 
 * @param lead - The lead to categorize
 * @returns Lead type information with display properties
 */
export const getLeadType = (lead: GMAPS_SCRAPE_LEAD_INFO): LeadType => {
    const website = hasWebsite(lead);
    const socialMedia = hasSocialMedia(lead);
    const phone = hasPhone(lead);

    // Hot Lead: No proper website but has phone OR has social media and phone
    if ((!website && phone) || (socialMedia && phone)) {
        return { 
            type: 'Hot Lead', 
            color: 'bg-green-50 border-green-200',
            category: 'hotLeads'
        };
    }
    
    // Warm Lead: Has proper website (with or without phone)
    if (website) {
        return { 
            type: 'Warm Lead', 
            color: 'bg-amber-50 border-amber-200',
            category: 'warmLeads'
        };
    }
    
    // Cold Lead: Everything else (no website, no social media, or social media without phone)
    return { 
        type: 'Cold Lead', 
        color: 'bg-gray-50 border-gray-200',
        category: 'coldLeads'
    };
};

/**
 * Generates a unique key for a lead (useful for React keys)
 * @param lead - The lead object
 * @param index - Optional index to ensure uniqueness
 * @returns A unique string key
 */
export const generateUniqueKey = (lead: GMAPS_SCRAPE_LEAD_INFO, index: number): string => {
    const baseKey = lead.gmapsUrl || `${lead.name}-${lead.phoneNumber || 'no-phone'}-${lead.website || 'no-website'}`;
    return `${baseKey}-${index}`;
};

