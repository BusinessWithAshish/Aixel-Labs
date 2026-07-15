/** Empty-string sentinel — never use raw `""` at call sites. */
export const GMAPS_EMPTY = "";

/** Token used when joining keywords + place-type label into a Maps search string. */
export const GMAPS_SEARCH_QUERY_JOIN = " ";

export const GMAPS_PLACE_TYPE_GROUP = {
  AUTOMOTIVE: "automotive",
  BUSINESS: "business",
  EDUCATION: "education",
  ENTERTAINMENT: "entertainment_and_recreation",
  FINANCE: "finance",
  FOOD_AND_DRINK: "food_and_drink",
  HEALTH: "health_and_wellness",
  LODGING: "lodging",
  SERVICES: "services",
  SHOPPING: "shopping",
  SPORTS: "sports",
} as const;

export type GmapsPlaceTypeGroupId =
  (typeof GMAPS_PLACE_TYPE_GROUP)[keyof typeof GMAPS_PLACE_TYPE_GROUP];

export type GmapsPlaceTypeGroupDef = {
  id: GmapsPlaceTypeGroupId;
  label: string;
};

export type GmapsPlaceTypeDef = {
  id: string;
  label: string;
  groupId: GmapsPlaceTypeGroupId;
};

export const GMAPS_PLACE_TYPE_GROUPS: readonly GmapsPlaceTypeGroupDef[] = [
  { id: GMAPS_PLACE_TYPE_GROUP.AUTOMOTIVE, label: "Automotive" },
  { id: GMAPS_PLACE_TYPE_GROUP.BUSINESS, label: "Business" },
  { id: GMAPS_PLACE_TYPE_GROUP.EDUCATION, label: "Education" },
  {
    id: GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT,
    label: "Entertainment and Recreation",
  },
  { id: GMAPS_PLACE_TYPE_GROUP.FINANCE, label: "Finance" },
  { id: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK, label: "Food and Drink" },
  { id: GMAPS_PLACE_TYPE_GROUP.HEALTH, label: "Health and Wellness" },
  { id: GMAPS_PLACE_TYPE_GROUP.LODGING, label: "Lodging" },
  { id: GMAPS_PLACE_TYPE_GROUP.SERVICES, label: "Services" },
  { id: GMAPS_PLACE_TYPE_GROUP.SHOPPING, label: "Shopping" },
  { id: GMAPS_PLACE_TYPE_GROUP.SPORTS, label: "Sports" },
] as const;

/**
 * Curated Places API Table A leaf types for lead gen.
 * Labels are human-readable Maps search terms (SSOT for compose + UI).
 */
export const GMAPS_PLACE_TYPES: readonly GmapsPlaceTypeDef[] = [
  // Automotive
  { id: "car_dealer", label: "Car dealer", groupId: GMAPS_PLACE_TYPE_GROUP.AUTOMOTIVE },
  { id: "car_rental", label: "Car rental", groupId: GMAPS_PLACE_TYPE_GROUP.AUTOMOTIVE },
  { id: "car_repair", label: "Car repair", groupId: GMAPS_PLACE_TYPE_GROUP.AUTOMOTIVE },
  { id: "car_wash", label: "Car wash", groupId: GMAPS_PLACE_TYPE_GROUP.AUTOMOTIVE },
  { id: "gas_station", label: "Gas station", groupId: GMAPS_PLACE_TYPE_GROUP.AUTOMOTIVE },
  { id: "parking", label: "Parking", groupId: GMAPS_PLACE_TYPE_GROUP.AUTOMOTIVE },
  { id: "tire_shop", label: "Tire shop", groupId: GMAPS_PLACE_TYPE_GROUP.AUTOMOTIVE },

  // Business
  { id: "corporate_office", label: "Corporate office", groupId: GMAPS_PLACE_TYPE_GROUP.BUSINESS },
  { id: "coworking_space", label: "Coworking space", groupId: GMAPS_PLACE_TYPE_GROUP.BUSINESS },
  { id: "farm", label: "Farm", groupId: GMAPS_PLACE_TYPE_GROUP.BUSINESS },
  { id: "manufacturer", label: "Manufacturer", groupId: GMAPS_PLACE_TYPE_GROUP.BUSINESS },
  { id: "supplier", label: "Supplier", groupId: GMAPS_PLACE_TYPE_GROUP.BUSINESS },

  // Education
  { id: "library", label: "Library", groupId: GMAPS_PLACE_TYPE_GROUP.EDUCATION },
  { id: "preschool", label: "Preschool", groupId: GMAPS_PLACE_TYPE_GROUP.EDUCATION },
  { id: "primary_school", label: "Primary school", groupId: GMAPS_PLACE_TYPE_GROUP.EDUCATION },
  { id: "school", label: "School", groupId: GMAPS_PLACE_TYPE_GROUP.EDUCATION },
  { id: "secondary_school", label: "Secondary school", groupId: GMAPS_PLACE_TYPE_GROUP.EDUCATION },
  { id: "university", label: "University", groupId: GMAPS_PLACE_TYPE_GROUP.EDUCATION },

  // Entertainment and Recreation
  { id: "amusement_park", label: "Amusement park", groupId: GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT },
  { id: "bowling_alley", label: "Bowling alley", groupId: GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT },
  { id: "casino", label: "Casino", groupId: GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT },
  { id: "community_center", label: "Community center", groupId: GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT },
  { id: "convention_center", label: "Convention center", groupId: GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT },
  { id: "event_venue", label: "Event venue", groupId: GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT },
  { id: "movie_theater", label: "Movie theater", groupId: GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT },
  { id: "night_club", label: "Night club", groupId: GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT },
  { id: "tourist_attraction", label: "Tourist attraction", groupId: GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT },
  { id: "wedding_venue", label: "Wedding venue", groupId: GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT },
  { id: "zoo", label: "Zoo", groupId: GMAPS_PLACE_TYPE_GROUP.ENTERTAINMENT },

  // Finance
  { id: "accounting", label: "Accounting", groupId: GMAPS_PLACE_TYPE_GROUP.FINANCE },
  { id: "atm", label: "ATM", groupId: GMAPS_PLACE_TYPE_GROUP.FINANCE },
  { id: "bank", label: "Bank", groupId: GMAPS_PLACE_TYPE_GROUP.FINANCE },

  // Food and Drink (broad leaves only)
  { id: "bakery", label: "Bakery", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },
  { id: "bar", label: "Bar", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },
  { id: "cafe", label: "Cafe", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },
  { id: "coffee_shop", label: "Coffee shop", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },
  { id: "fast_food_restaurant", label: "Fast food restaurant", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },
  { id: "ice_cream_shop", label: "Ice cream shop", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },
  { id: "meal_delivery", label: "Meal delivery", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },
  { id: "meal_takeaway", label: "Meal takeaway", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },
  { id: "pizza_restaurant", label: "Pizza restaurant", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },
  { id: "restaurant", label: "Restaurant", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },
  { id: "seafood_restaurant", label: "Seafood restaurant", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },
  { id: "steak_house", label: "Steak house", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },
  { id: "sushi_restaurant", label: "Sushi restaurant", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },
  { id: "vegetarian_restaurant", label: "Vegetarian restaurant", groupId: GMAPS_PLACE_TYPE_GROUP.FOOD_AND_DRINK },

  // Health and Wellness
  { id: "dental_clinic", label: "Dental clinic", groupId: GMAPS_PLACE_TYPE_GROUP.HEALTH },
  { id: "dentist", label: "Dentist", groupId: GMAPS_PLACE_TYPE_GROUP.HEALTH },
  { id: "doctor", label: "Doctor", groupId: GMAPS_PLACE_TYPE_GROUP.HEALTH },
  { id: "drugstore", label: "Drugstore", groupId: GMAPS_PLACE_TYPE_GROUP.HEALTH },
  { id: "hospital", label: "Hospital", groupId: GMAPS_PLACE_TYPE_GROUP.HEALTH },
  { id: "medical_clinic", label: "Medical clinic", groupId: GMAPS_PLACE_TYPE_GROUP.HEALTH },
  { id: "pharmacy", label: "Pharmacy", groupId: GMAPS_PLACE_TYPE_GROUP.HEALTH },
  { id: "physiotherapist", label: "Physiotherapist", groupId: GMAPS_PLACE_TYPE_GROUP.HEALTH },
  { id: "spa", label: "Spa", groupId: GMAPS_PLACE_TYPE_GROUP.HEALTH },
  { id: "veterinary_care", label: "Veterinary care", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "wellness_center", label: "Wellness center", groupId: GMAPS_PLACE_TYPE_GROUP.HEALTH },
  { id: "yoga_studio", label: "Yoga studio", groupId: GMAPS_PLACE_TYPE_GROUP.HEALTH },

  // Lodging
  { id: "bed_and_breakfast", label: "Bed and breakfast", groupId: GMAPS_PLACE_TYPE_GROUP.LODGING },
  { id: "campground", label: "Campground", groupId: GMAPS_PLACE_TYPE_GROUP.LODGING },
  { id: "guest_house", label: "Guest house", groupId: GMAPS_PLACE_TYPE_GROUP.LODGING },
  { id: "hostel", label: "Hostel", groupId: GMAPS_PLACE_TYPE_GROUP.LODGING },
  { id: "hotel", label: "Hotel", groupId: GMAPS_PLACE_TYPE_GROUP.LODGING },
  { id: "motel", label: "Motel", groupId: GMAPS_PLACE_TYPE_GROUP.LODGING },
  { id: "resort_hotel", label: "Resort hotel", groupId: GMAPS_PLACE_TYPE_GROUP.LODGING },

  // Services
  { id: "barber_shop", label: "Barber shop", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "beauty_salon", label: "Beauty salon", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "catering_service", label: "Catering service", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "child_care_agency", label: "Child care agency", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "consultant", label: "Consultant", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "courier_service", label: "Courier service", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "electrician", label: "Electrician", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "employment_agency", label: "Employment agency", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "florist", label: "Florist", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "funeral_home", label: "Funeral home", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "hair_salon", label: "Hair salon", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "insurance_agency", label: "Insurance agency", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "laundry", label: "Laundry", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "lawyer", label: "Lawyer", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "locksmith", label: "Locksmith", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "moving_company", label: "Moving company", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "nail_salon", label: "Nail salon", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "painter", label: "Painter", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "plumber", label: "Plumber", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "real_estate_agency", label: "Real estate agency", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "roofing_contractor", label: "Roofing contractor", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "storage", label: "Storage", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },
  { id: "travel_agency", label: "Travel agency", groupId: GMAPS_PLACE_TYPE_GROUP.SERVICES },

  // Shopping
  { id: "book_store", label: "Book store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "clothing_store", label: "Clothing store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "convenience_store", label: "Convenience store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "department_store", label: "Department store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "electronics_store", label: "Electronics store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "furniture_store", label: "Furniture store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "gift_shop", label: "Gift shop", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "grocery_store", label: "Grocery store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "hardware_store", label: "Hardware store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "home_goods_store", label: "Home goods store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "jewelry_store", label: "Jewelry store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "liquor_store", label: "Liquor store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "pet_store", label: "Pet store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "shoe_store", label: "Shoe store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "shopping_mall", label: "Shopping mall", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "sporting_goods_store", label: "Sporting goods store", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },
  { id: "supermarket", label: "Supermarket", groupId: GMAPS_PLACE_TYPE_GROUP.SHOPPING },

  // Sports
  { id: "fitness_center", label: "Fitness center", groupId: GMAPS_PLACE_TYPE_GROUP.SPORTS },
  { id: "golf_course", label: "Golf course", groupId: GMAPS_PLACE_TYPE_GROUP.SPORTS },
  { id: "gym", label: "Gym", groupId: GMAPS_PLACE_TYPE_GROUP.SPORTS },
  { id: "sports_club", label: "Sports club", groupId: GMAPS_PLACE_TYPE_GROUP.SPORTS },
  { id: "stadium", label: "Stadium", groupId: GMAPS_PLACE_TYPE_GROUP.SPORTS },
  { id: "swimming_pool", label: "Swimming pool", groupId: GMAPS_PLACE_TYPE_GROUP.SPORTS },
] as const;

export const GMAPS_PLACE_TYPE_FIELD_DESCRIPTIONS = {
  placeType:
    "Places API Table A leaf type id (e.g. dentist, plumber, restaurant). Prefer this over free-text when the user names a known business category. Omit when only custom keywords or urls are provided.",
} as const;
