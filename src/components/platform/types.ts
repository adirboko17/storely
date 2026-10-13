export type PlatformMember = {
  name: string;
  email: string;
  role: string;
  roleKey: string;
  status: string;
};

export type PlatformStore = {
  id: string;
  name: string;
  status: string;
  environment: string;
  displayName: string;
  hostname: string | null;
  domainVerified: boolean;
  modules: Array<{ id: string; enabled: boolean }>;
  members: PlatformMember[];
};
