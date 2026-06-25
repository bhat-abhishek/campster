import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ContactListController } from './contactList.controller';
import { ContactListService } from './contactList.service';
import { ContactService } from '../contact/contact.service';
import { ProjectAccessService } from '../project-access/projectAccess.service';
import { ContactListMembershipService } from './contactListMembership.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

jest.mock('@/utils/generators', () => ({
  generateUlid: jest.fn().mockReturnValue('test-ulid-01234567890'),
}));

type Mocked<T> = { [K in keyof T]: jest.Mock };

const createContactListServiceMock = (): Mocked<ContactListService> =>
  ({
    getContactLists: jest.fn(),
    createContactList: jest.fn(),
    getAContactList: jest.fn(),
    archiveLists: jest.fn(),
    searchByName: jest.fn(),
    decodeCSV: jest.fn(),
    updateContactListContactsCount: jest.fn(),
    updateContactList: jest.fn(),
    deleteContactList: jest.fn(),
  }) as unknown as Mocked<ContactListService>;

const createContactServiceMock = (): Mocked<ContactService> =>
  ({
    getContactByEmail: jest.fn(),
    createNewContact: jest.fn(),
  }) as unknown as Mocked<ContactService>;

const createProjectAccessServiceMock = (): Mocked<ProjectAccessService> =>
  ({
    getProjectAccess: jest.fn(),
    getAllProjectAccess: jest.fn(),
    createProjectAccess: jest.fn(),
    getDefaultProjectAcccess: jest.fn(),
  }) as unknown as Mocked<ProjectAccessService>;

const createContactListMembershipServiceMock =
  (): Mocked<ContactListMembershipService> =>
    ({
      addContactToList: jest.fn(),
      getContactsOfContactList: jest.fn(),
      deleteContactFromList: jest.fn(),
    }) as unknown as Mocked<ContactListMembershipService>;

const createJwtServiceMock = (): Mocked<JwtService> =>
  ({
    verify: jest.fn(),
    verifyAsync: jest.fn(),
    sign: jest.fn(),
    signAsync: jest.fn(),
    decode: jest.fn(),
  }) as unknown as Mocked<JwtService>;

const createConfigServiceMock = (
  values: Record<string, unknown> = { JWT_SECRET: 'test-secret' },
): Mocked<ConfigService> =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as Mocked<ConfigService>;

const buildContactList = (overrides: Record<string, unknown> = {}) => ({
  id: 'list_xyz1234567890',
  name: 'Subscribers',
  description: 'Main newsletter list',
  project_id: 'proj_abc',
  total_contacts: 0,
  status: 'active',
  created_by: 'user_123',
  ...overrides,
});

const buildProjectAccess = (overrides: Record<string, unknown> = {}) => ({
  project_id: 'proj_abc',
  user_id: 'user_123',
  role_id: 2,
  ...overrides,
});

describe('ContactListController', () => {
  let controller: ContactListController;
  let contactListSvc: Mocked<ContactListService>;
  let contactSvc: Mocked<ContactService>;
  let projectAccessSvc: Mocked<ProjectAccessService>;
  let membershipSvc: Mocked<ContactListMembershipService>;

  beforeEach(async () => {
    contactListSvc = createContactListServiceMock();
    contactSvc = createContactServiceMock();
    projectAccessSvc = createProjectAccessServiceMock();
    membershipSvc = createContactListMembershipServiceMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ContactListController],
      providers: [
        { provide: ContactListService, useValue: contactListSvc },
        { provide: ContactService, useValue: contactSvc },
        { provide: ProjectAccessService, useValue: projectAccessSvc },
        { provide: ContactListMembershipService, useValue: membershipSvc },
        { provide: JwtService, useValue: createJwtServiceMock() },
        { provide: ConfigService, useValue: createConfigServiceMock() },
      ],
    }).compile();

    controller = moduleRef.get(ContactListController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getAllContactLists', () => {
    it('throws Unauthorized when the user has no access to the project', async () => {
      projectAccessSvc.getProjectAccess.mockResolvedValue(undefined);
      const req: any = { user: { id: 'user_123' } };

      await expect(
        controller.getAllContactLists({ project_id: 'proj_abc' } as any, req),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(contactListSvc.getContactLists).not.toHaveBeenCalled();
    });

    it('returns the lists when the user has project access', async () => {
      const lists = [buildContactList()];
      projectAccessSvc.getProjectAccess.mockResolvedValue(buildProjectAccess());
      contactListSvc.getContactLists.mockResolvedValue(lists);
      const req: any = { user: { id: 'user_123' } };

      await expect(
        controller.getAllContactLists({ project_id: 'proj_abc' } as any, req),
      ).resolves.toBe(lists);

      expect(contactListSvc.getContactLists).toHaveBeenCalledWith({
        project_id: 'proj_abc',
      });
    });
  });

  describe('createContactList', () => {
    it('throws Unauthorized when the user has no project access', async () => {
      projectAccessSvc.getProjectAccess.mockResolvedValue(undefined);
      const req: any = { user: { id: 'user_123' } };
      const body: any = { project_id: 'proj_abc', name: 'Subscribers' };

      await expect(
        controller.createContactList(body, req),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws Unauthorized when the user is a viewer (role_id > 3)', async () => {
      projectAccessSvc.getProjectAccess.mockResolvedValue(
        buildProjectAccess({ role_id: 4 }),
      );
      const req: any = { user: { id: 'user_123' } };
      const body: any = { project_id: 'proj_abc', name: 'Subscribers' };

      await expect(
        controller.createContactList(body, req),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('creates the list when the user has sufficient access (role_id <= 3)', async () => {
      const newList = buildContactList();
      projectAccessSvc.getProjectAccess.mockResolvedValue(
        buildProjectAccess({ role_id: 2 }),
      );
      contactListSvc.createContactList.mockResolvedValue(newList);
      const req: any = { user: { id: 'user_123' } };
      const body: any = { project_id: 'proj_abc', name: 'Subscribers' };

      await expect(controller.createContactList(body, req)).resolves.toBe(newList);

      expect(contactListSvc.createContactList).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-ulid-01234567890',
          project_id: 'proj_abc',
          name: 'Subscribers',
          status: 'active',
          created_by: 'user_123',
        }),
      );
    });
  });

  describe('archiveContactLists', () => {
    it('delegates to ContactListService.archiveLists with the list ids and project_id', async () => {
      const req: any = { project_id: 'proj_abc' };
      const result = { archived: 2 };
      contactListSvc.archiveLists.mockResolvedValue(result);

      await expect(
        controller.archiveContactLists('list1,list2', req),
      ).resolves.toBe(result);

      expect(contactListSvc.archiveLists).toHaveBeenCalledWith(
        'list1,list2',
        'proj_abc',
      );
    });
  });

  describe('searchByName', () => {
    it('delegates to ContactListService.searchByName with the search term', async () => {
      const results = [buildContactList({ name: 'Subscribers' })];
      contactListSvc.searchByName.mockResolvedValue(results);

      await expect(
        controller.searchByName({ search: 'sub' } as any),
      ).resolves.toBe(results);

      expect(contactListSvc.searchByName).toHaveBeenCalledWith('sub');
    });
  });

  describe('getContactsOfContactList', () => {
    it('delegates to ContactListMembershipService with id and pagination params', async () => {
      const contacts = [{ id: 'contact_1', email: 'a@example.com' }];
      membershipSvc.getContactsOfContactList.mockResolvedValue(contacts);

      await expect(
        controller.getContactsOfContactList('list_xyz1234567890', {
          page: 1,
          page_limit: 10,
        } as any),
      ).resolves.toBe(contacts);

      expect(membershipSvc.getContactsOfContactList).toHaveBeenCalledWith(
        'list_xyz1234567890',
        1,
        10,
      );
    });
  });

  describe('addAContact', () => {
    it('adds an existing contact to the list without creating a new record', async () => {
      const existingContact = { id: 'contact_existing', email: 'existing@example.com' };
      contactSvc.getContactByEmail.mockResolvedValue(existingContact);
      contactListSvc.updateContactListContactsCount.mockResolvedValue(undefined);
      const body: any = {
        email: 'existing@example.com',
        contact_list_id: 'list_xyz1234567890',
        first_name: 'Jane',
      };

      await controller.addAContact(body);

      expect(contactSvc.createNewContact).not.toHaveBeenCalled();
      expect(membershipSvc.addContactToList).toHaveBeenCalledWith(
        'list_xyz1234567890',
        'contact_existing',
      );
      expect(contactListSvc.updateContactListContactsCount).toHaveBeenCalledWith(
        'list_xyz1234567890',
      );
    });

    it('creates a new contact and adds them when they do not exist', async () => {
      contactSvc.getContactByEmail.mockResolvedValue(undefined);
      const newContact = { id: 'test-ulid-01234567890', email: 'new@example.com' };
      contactSvc.createNewContact.mockResolvedValue(newContact);
      contactListSvc.updateContactListContactsCount.mockResolvedValue(undefined);
      const body: any = {
        email: 'new@example.com',
        contact_list_id: 'list_xyz1234567890',
        first_name: 'New',
      };

      const result = await controller.addAContact(body);

      expect(contactSvc.createNewContact).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-ulid-01234567890',
        }),
      );
      expect(membershipSvc.addContactToList).toHaveBeenCalledWith(
        'list_xyz1234567890',
        'test-ulid-01234567890',
      );
      expect(result).toBe(newContact);
    });
  });

  describe('deleteContactFromList', () => {
    it('throws NotFoundException when no contacts were removed', async () => {
      membershipSvc.deleteContactFromList.mockResolvedValue(undefined);
      const body: any = {
        contact_list_id: 'list_xyz1234567890',
        contact_ids: ['contact_1'],
      };

      await expect(
        controller.deleteContactFromList(body),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('removes the contacts and updates the list contact count', async () => {
      const deleted = [{ id: 'contact_1' }];
      membershipSvc.deleteContactFromList.mockResolvedValue(deleted);
      contactListSvc.updateContactListContactsCount.mockReturnValue(undefined);
      const body: any = {
        contact_list_id: 'list_xyz1234567890',
        contact_ids: ['contact_1'],
      };

      await expect(controller.deleteContactFromList(body)).resolves.toBe(deleted);

      expect(membershipSvc.deleteContactFromList).toHaveBeenCalledWith(
        'list_xyz1234567890',
        ['contact_1'],
      );
      expect(contactListSvc.updateContactListContactsCount).toHaveBeenCalledWith(
        'list_xyz1234567890',
      );
    });
  });

  describe('updateContactList', () => {
    it('delegates to ContactListService.updateContactList with the id and body', async () => {
      const updated = buildContactList({ name: 'Renamed List' });
      contactListSvc.updateContactList.mockResolvedValue(updated);
      const body: any = { name: 'Renamed List' };

      await expect(
        controller.updateContactList('list_xyz1234567890', body),
      ).resolves.toBe(updated);

      expect(contactListSvc.updateContactList).toHaveBeenCalledWith(
        'list_xyz1234567890',
        body,
      );
    });
  });

  describe('getAContactList', () => {
    it('delegates to ContactListService.getAContactList with the id', async () => {
      const list = buildContactList();
      contactListSvc.getAContactList.mockResolvedValue(list);

      await expect(
        controller.getAContactList('list_xyz1234567890'),
      ).resolves.toBe(list);

      expect(contactListSvc.getAContactList).toHaveBeenCalledWith(
        'list_xyz1234567890',
      );
    });
  });
});
