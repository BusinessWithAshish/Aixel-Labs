type LeadInfo = {
  email?: string | string[];
  phoneNumber?: string | string[];
  websiteUrl?: string | string[];
  socialProfiles?: string[];
}

type LeadFilterProps = {
  leadInfo: LeadInfo;
}

/**
 * Handles lead routing based on available contact information
 * Returns an object with routing information and recommended action
 */
function leadFilter(props: LeadFilterProps): {
  scenario: string;
  primaryAction: string;
  system: string;
  description?: string;
  recursiveSystem?: string | string[];
} {
  const { leadInfo } = props;

  // Extract and normalize information
  const hasEmail = leadInfo.email && (typeof leadInfo.email === 'string' ? leadInfo.email.trim() !== '' : leadInfo.email.length > 0);
  const hasPhone = leadInfo.phoneNumber && (typeof leadInfo.phoneNumber === 'string' ? leadInfo.phoneNumber.trim() !== '' : leadInfo.phoneNumber.length > 0);
  const hasWebsite = leadInfo.websiteUrl && (typeof leadInfo.websiteUrl === 'string' ? leadInfo.websiteUrl.trim() !== '' : leadInfo.websiteUrl.length > 0);
  const hasSocial = leadInfo.socialProfiles && leadInfo.socialProfiles.length > 0;

  // Handle all possible combinations

  // Case: All information available
  if (hasEmail && hasPhone && hasWebsite && hasSocial) {
    return {
      scenario: "allContactInfo",
      primaryAction: "Orchestrated multi-channel approach",
      system: "Manual High-Value Outreach"
    };
  }

  // Cases with Email + combinations
  if (hasEmail) {
    if (hasPhone && hasWebsite) {
      return {
        scenario: "emailPhoneWebsite",
        primaryAction: "Multi-touch sequence with website insights",
        system: "Combined Email + Call System"
      };
    }

    if (hasPhone && hasSocial) {
      return {
        scenario: "emailPhoneSocial",
        primaryAction: "Multi-touch sequence with social engagement",
        system: "Combined Email + Call + Social System"
      };
    }

    if (hasWebsite && hasSocial) {
      return {
        scenario: "emailWebsiteSocial",
        primaryAction: "Personalized email with website and social insights",
        system: "Cold Email System with Social Engagement"
      };
    }

    if (hasPhone) {
      return {
        scenario: "emailAndPhone",
        primaryAction: "Multi-touch sequence",
        system: "Combined Email + Call System",
        recursiveSystem: [
          "professional email -> website -> socials -> PC-DM",
          "normal email -> google search -> PC-ES"
        ]
      };
    }

    // DONE
    if (hasWebsite) {
      return {
        scenario: "emailAndWebsite",
        primaryAction: "Personalized cold email with website insights",
        system: "Cold Email System",
        recursiveSystem: [
          "website -> socials -> social stalk -> PC-DM",
          "website -> email -> PC-ES",
        ]
      };
    }

    // DONE
    if (hasSocial) {
      return {
        scenario: "emailAndSocial",
        primaryAction: "Email with social engagement",
        system: "Cold Email System with Social Support",
        description: "email -> stalk and connect on social -> PC-DM",
        recursiveSystem: []
      };
    }

    // DONE
    return {
      scenario: "emailOnly",
      primaryAction: "Forward to cold email system",
      system: "Cold Email System",
      description: "email -> PC-ES",
      recursiveSystem: [
        "professional email -> website -> socials -> PC-DM",
        "normal email -> google search -> PC-ES"
      ]
    };
  }

  // Cases with Phone + combinations (without email)
  if (hasPhone) {
    if (hasWebsite && hasSocial) {
      return {
        scenario: "phoneWebsiteSocial",
        primaryAction: "Informed call with social context",
        system: "Cold Call System with Social Support"
      };
    }

    if (hasWebsite) {
      return {
        scenario: "phoneAndWebsite",
        primaryAction: "Informed cold call",
        system: "Cold Call System"
      };
    }

    if (hasSocial) {
      return {
        scenario: "phoneAndSocial",
        primaryAction: "Cold call with social context",
        system: "Cold Call System with Social Support"
      };
    }

    return {
      scenario: "phoneOnly",
      primaryAction: "Route to cold call system",
      system: "Cold Call System"
    };
  }

  // Cases with Website + combinations (without email or phone)
  if (hasWebsite) {
    if (hasSocial) {
      return {
        scenario: "websiteAndSocial",
        primaryAction: "Social engagement with website insights",
        system: "Cold DM System with Website Research"
      };
    }

    return {
      scenario: "websiteOnly",
      primaryAction: "Website research then find contact channels",
      system: "Research System"
    };
  }

  // Case: Social only
  if (hasSocial) {
    return {
      scenario: "socialProfilesOnly",
      primaryAction: "Social engagement before direct outreach",
      system: "Cold DM System"
    };
  }

  // Case: No information
  return {
    scenario: "noContactInfo",
    primaryAction: "Deprioritize or seek alternative sources",
    system: "Research or Deprioritize"
  };
}

// Example usage:
const exampleLead = {
  leadInfo: {
    email: "contact@example.com",
    phoneNumber: "+1234567890",
    websiteUrl: "https://example.com",
    socialProfiles: ["https://linkedin.com/company/example"]
  }
};

const routingDecision = leadFilter(exampleLead);
console.log(routingDecision);