export type MemberRole = 'primary' | 'spouse' | 'dependent';
export type DependentType = 'adult' | 'child';
export type PetType = 'dog' | 'cat' | 'bird' | 'rabbit' | 'fish' | 'horse' | 'reptile';
export type FeedingMode = 'commercial' | 'homemade';

export interface HouseholdMember {
  id: string;
  role: MemberRole;
  dependentType: DependentType | null;
  name: string;
  birthYear: number;
  ssPia: number | null;
  ssFra: number | null;
  ssClaimAge: number | null;
  sortOrder: number;
}

export interface HouseholdPet {
  id: string;
  name: string;
  type: PetType;
  breed: string | null;
  size: string | null;
  weight: number;
  weightTier: string;
  feedingMode: FeedingMode | null;
  birthYear: number;
  expectedLifespan: number;
  sortOrder: number;
}

export interface HouseholdProfile {
  id: string;
  adultsCount: number;
  targetAnnualIncome: number;
  planningStartYear: number;
  planningYears: number;
  requirements: string[];
  members: HouseholdMember[];
  pets: HouseholdPet[];
  createdAt: string;
  updatedAt: string;
}
