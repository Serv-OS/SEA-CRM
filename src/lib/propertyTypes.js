// Property types for construction locations (stored in locations.venue_type).
export const PROPERTY_TYPES = [
  ['single_family', 'Single-family home'],
  ['multi_family', 'Multi-family'],
  ['townhouse', 'Townhouse'],
  ['condo', 'Condominium'],
  ['apartment', 'Apartment building'],
  ['adu', 'Accessory dwelling unit (ADU)'],
  ['mobile_home', 'Mobile / manufactured home'],
  ['commercial', 'Commercial'],
  ['industrial', 'Industrial'],
  ['mixed_use', 'Mixed-use'],
  ['new_construction', 'New construction'],
  ['hoa', 'HOA / community'],
  ['other', 'Other'],
];

const LABELS = Object.fromEntries(PROPERTY_TYPES);
// Pretty label for a stored value; falls back to de-underscored text.
export const propertyTypeLabel = (v) => LABELS[v] || (v ? String(v).replace(/_/g, ' ') : '');
