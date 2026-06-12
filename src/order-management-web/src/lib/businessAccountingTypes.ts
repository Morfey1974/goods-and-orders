export const HOME_EXPENSE_TYPES = [
  'Electricity',
  'Arnona',
  'Water',
  'VaadBayit',
  'PhoneInternet',
  'MortgageInterest',
  'Cleaning',
  'Other',
] as const;

export type HomeExpenseType = (typeof HOME_EXPENSE_TYPES)[number];

export const OPERATING_EXPENSE_TYPES = [
  'Accountant',
  'OfficeSupplies',
  'Advertising',
  'BankFees',
  'Insurance',
  'ProfessionalServices',
  'SoftwareSubscription',
  'Rent',
  'Materials',
  'Other',
] as const;

export type OperatingExpenseType = (typeof OPERATING_EXPENSE_TYPES)[number];

export const DEPRECIATION_CATEGORIES = [
  'Furniture',
  'OtherEquipment',
  'AirConditioner',
  'ConstructionEquipment',
  'Vehicle',
  'PersonalPc',
  'OtherPc',
  'ProfessionalBooks',
] as const;

export type DepreciationCategory = (typeof DEPRECIATION_CATEGORIES)[number];

export const DEPRECIATION_RATES: Record<DepreciationCategory, number> = {
  Furniture: 6,
  OtherEquipment: 7,
  AirConditioner: 10,
  ConstructionEquipment: 15,
  Vehicle: 20,
  PersonalPc: 100 / 3,
  OtherPc: 25,
  ProfessionalBooks: 25,
};
