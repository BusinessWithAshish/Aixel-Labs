import type { OptionType } from '@/components/ui/searchable-select';
import {
    LINKEDIN_COMPANY_SIZE_ENUM,
    LINKEDIN_COMPANY_TYPE_ENUM,
    LINKEDIN_SENIORITY_ENUM,
} from '@aixellabs/backend/linkedin/constants';
import { caseConverter, enumToTitleCase } from '@/helpers/string-helpers';

/** Placeholder until LinkedIn industry options are wired from an API or static list. */
export const LINKEDIN_EMPTY_SELECT_OPTIONS: OptionType[] = [];

export const LINKEDIN_SENIORITY_OPTIONS: OptionType[] = (Object.values(LINKEDIN_SENIORITY_ENUM) as string[]).map(
    (value) => ({
        value,
        label: enumToTitleCase(value),
    }),
);

export const LINKEDIN_COMPANY_SIZE_OPTIONS: OptionType[] = (Object.values(LINKEDIN_COMPANY_SIZE_ENUM) as string[]).map(
    (value) => ({
        value,
        label: caseConverter(value),
    }),
);

/** Values match `LINKEDIN_COMPANY_TYPE_ENUM` for `z.nativeEnum` payloads. */
export const LINKEDIN_COMPANY_TYPE_OPTIONS: OptionType[] = (Object.values(LINKEDIN_COMPANY_TYPE_ENUM) as string[]).map(
    (value) => ({
        value,
        label: value,
    }),
);
