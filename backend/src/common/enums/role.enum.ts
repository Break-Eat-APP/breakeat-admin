/**
 * Platform-level roles — stored on User.globalRole.
 * Must stay in sync with GlobalRole enum in prisma/schema.prisma.
 */
export enum GlobalRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  CUSTOMER = 'CUSTOMER',
}

/**
 * Organisation-level roles — stored on OrganizationMember.orgRole.
 * Must stay in sync with OrgRole enum in prisma/schema.prisma.
 */
export enum OrgRole {
  ORG_ADMIN = 'ORG_ADMIN',
  MANAGER = 'MANAGER',
  OPERATOR = 'OPERATOR',
  MARKETING = 'MARKETING',
}
