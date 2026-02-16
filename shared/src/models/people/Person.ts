export interface Person {
  id: string;
  name: string;
  email?: string;
  birthdate?: string;
  nationalId?: string;
}

export interface PersonIdentifier {
  id: string;
  personId: string;
  organizationId: string;
  identifier: string; // The "personOrgId"
}
