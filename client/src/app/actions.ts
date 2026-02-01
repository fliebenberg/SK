"use server";

import { store } from "@/app/store/store";
import { revalidatePath } from "next/cache";
import { Organization } from "@sk/types";

export async function addTeamAction(formData: FormData) {
  const name = formData.get("name") as string;
  const sportId = formData.get("sportId") as string;
  const ageGroup = formData.get("ageGroup") as string;
  const organizationId = formData.get("organizationId") as string;

  if (!name || !sportId || !ageGroup || !organizationId) {
    throw new Error("Missing required fields");
  }

  const newTeam = await store.addTeam({
    name,
    sportId,
    ageGroup,
    organizationId,
  });

  revalidatePath("/teams");
  revalidatePath(`/admin/organizations/${organizationId}`);
  revalidatePath(`/admin/organizations/${organizationId}/teams`);
  
  return newTeam;
}

export async function updateTeamAction(id: string, data: Partial<import("@/types").Team>) {
  const updatedTeam = await store.updateTeam(id, data);
  if (updatedTeam) {
    revalidatePath(`/admin/organizations/${updatedTeam.organizationId}/teams/${id}`);
    revalidatePath(`/admin/organizations/${updatedTeam.organizationId}/teams`);
    revalidatePath(`/admin/organizations/${updatedTeam.organizationId}`);
  }
  return updatedTeam;
}

export async function addPersonAction(name: string, roleId: string, teamId: string) {
  if (!name || !roleId || !teamId) {
    throw new Error("Missing required fields");
  }

  // 1. Create Person
  const newPerson = await store.addPerson({
    name,
  });

  // 2. Create Membership
  await store.addTeamMember(newPerson.id, teamId, roleId);

  const team = store.getTeam(teamId);
  if (team) {
    revalidatePath(`/admin/organizations/${team.organizationId}/teams/${teamId}/players`);
    revalidatePath(`/teams/${teamId}`);
  }
  revalidatePath(`/admin/organizations`); // Revalidate generally to be safe
}

export async function addPersonFromForm(formData: FormData) {
  const name = formData.get("name") as string;
  const roleId = formData.get("roleId") as string;
  const teamId = formData.get("teamId") as string;

  if (!name || !roleId || !teamId) {
    throw new Error("Missing required fields");
  }

  // 1. Create Person
  const newPerson = await store.addPerson({
    name,
  });

  // 2. Create Membership
  // 2. Create Membership
  await store.addTeamMember(newPerson.id, teamId, roleId);

  revalidatePath(`/teams/${teamId}`);
  revalidatePath(`/admin/organizations`);
}

export async function addTeamMemberAction(personId: string, teamId: string, roleId: string) {
    await store.addTeamMember(personId, teamId, roleId);
    revalidatePath(`/teams/${teamId}`);
}

export async function removeTeamMemberAction(membershipId: string, teamId: string) {
    await store.removeTeamMember(membershipId);
    revalidatePath(`/teams/${teamId}`);
    revalidatePath(`/admin/organizations`);
}

export async function addVenueAction(formData: FormData) {
  const name = formData.get("name") as string;
  const address = formData.get("address") as string;

  if (!name || !address) {
    throw new Error("Missing required fields");
  }

  await store.addVenue({
    name,
    address,
    organizationId: "org-1", // TODO: Get from form/context
  });

  revalidatePath("/venues");
}

export async function addGameAction(formData: FormData) {
  const homeTeamId = formData.get("homeTeamId") as string;
  const awayTeamId = formData.get("awayTeamId") as string;
  const venueId = formData.get("venueId") as string;
  const date = formData.get("date") as string;
  const time = formData.get("time") as string;

  if (!homeTeamId || !awayTeamId || !venueId || !date || !time) {
    throw new Error("Missing required fields");
  }

  await store.addGame({
    eventId: "event-1", // Simplified for MVP
    homeTeamId,
    awayTeamId,
    startTime: `${date}T${time}`,
  });

  revalidatePath("/admin");
}

export async function updateGameStatusAction(gameId: string, status: "Scheduled" | "Live" | "Finished") {
  store.updateGameStatus(gameId, status);
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
}

export async function updateScoreAction(gameId: string, homeScore: number, awayScore: number) {
  store.updateScore(gameId, homeScore, awayScore);
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
}
export async function updateOrganizationAction(id: string, data: Partial<Organization>) {
  await store.updateOrganization(id, data);
  revalidatePath("/admin");
  revalidatePath(`/admin/organizations/${id}`);
}

export async function getOrganizationsAction() {
  return store.getOrganizations();
}

export async function createOrganizationAction(data: Omit<Organization, "id">) {
  const newOrg = await store.addOrganization(data);
  revalidatePath("/admin");
  return newOrg;
}
