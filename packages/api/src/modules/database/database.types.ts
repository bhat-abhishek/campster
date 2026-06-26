import { CampaignTable } from '@/schemas/campaign.schema';
import { ContactListMembershipTable } from '@/schemas/contact-list-junction';
import { ContactListTable } from '@/schemas/contact-list.schema';
import { ContactTable } from '@/schemas/contacts.schema';
import { EmailTemplateTable } from '@/schemas/email-template.schema';
import { EmailTable } from '@/schemas/email.schema';
import { EmailViewTable } from '@/schemas/emailView.schema';
import { ApiKeyTable } from 'src/schemas/api-key.schema';
import { ProjectAccess } from 'src/schemas/project-access.schema';
import { ProjectTable } from 'src/schemas/project.schema';
import { RoleTable } from 'src/schemas/role.schema';
import { UserTable } from 'src/schemas/user.schema';
import { EmailClickTable } from '@/schemas/emailClick.schema';
import { TransactionalEmailTable } from '@/schemas/transactionalEmail.schema';
import { SesConfigTable } from '@/schemas/ses-config.schema';
import { SendgridConfigTable } from '@/schemas/sendgrid-config.schema';

export interface Database {
  users: UserTable;
  projects: ProjectTable;
  roles: RoleTable;
  project_accesses: ProjectAccess;
  api_keys: ApiKeyTable;
  contact_lists: ContactListTable;
  contacts: ContactTable;
  campaigns: CampaignTable;
  email_templates: EmailTemplateTable;
  contact_list_memberships: ContactListMembershipTable;
  emails: EmailTable;
  email_views: EmailViewTable;
  email_clicks: EmailClickTable;
  transactional_emails: TransactionalEmailTable;
  ses_configs: SesConfigTable;
  sendgrid_configs: SendgridConfigTable;
}
