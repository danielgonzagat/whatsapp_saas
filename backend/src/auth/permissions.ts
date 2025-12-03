export enum Permission {
  // Flows
  FLOW_VIEW = 'FLOW_VIEW',
  FLOW_EDIT = 'FLOW_EDIT',
  FLOW_DELETE = 'FLOW_DELETE',
  FLOW_EXECUTE = 'FLOW_EXECUTE',

  // Contacts
  CONTACT_VIEW = 'CONTACT_VIEW',
  CONTACT_EDIT = 'CONTACT_EDIT',
  CONTACT_EXPORT = 'CONTACT_EXPORT', // Critical for security

  // Inbox
  INBOX_VIEW = 'INBOX_VIEW',
  INBOX_REPLY = 'INBOX_REPLY',
  INBOX_ASSIGN = 'INBOX_ASSIGN',

  // Settings
  SETTINGS_VIEW = 'SETTINGS_VIEW',
  SETTINGS_EDIT = 'SETTINGS_EDIT',

  // Billing
  BILLING_VIEW = 'BILLING_VIEW',
  BILLING_MANAGE = 'BILLING_MANAGE',
}

export const ROLE_PERMISSIONS = {
  ADMIN: Object.values(Permission),
  AGENT: [
    Permission.FLOW_VIEW,
    Permission.CONTACT_VIEW,
    Permission.CONTACT_EDIT,
    Permission.INBOX_VIEW,
    Permission.INBOX_REPLY,
  ],
};
