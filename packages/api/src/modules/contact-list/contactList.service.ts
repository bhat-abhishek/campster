import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ContactListQueryDto } from './dto/contactListQuery.dto';
import { Kysely, sql } from 'kysely';
import { Database } from '../database/database.types';
import {
  NewContactList,
  UpdateContactList,
} from '@/schemas/contact-list.schema';
import { NewContact } from '@/schemas/contacts.schema';

import * as csv from 'csv-parse';
import { generateUlid } from '@/utils/generators';
import * as stream from 'stream';

@Injectable()
export class ContactListService implements OnModuleInit {
  private readonly logger = new Logger(ContactListService.name);
  private db: Kysely<Database>;
  constructor(private dbService: DatabaseService) {}

  onModuleInit() {
    this.db = this.dbService.getDb();
  }

  async getContactLists(query: ContactListQueryDto) {
    let { page, page_limit } = query;
    const { project_id } = query;

    page = Number(page) || 1;
    page_limit = Number(page_limit) || 10;

    return await this.db
      .selectFrom('contact_lists as cl')
      .where('cl.project_id', '=', project_id)
      .where('status', '=', 'active')
      .leftJoin('users as u', 'u.id', 'cl.created_by')
      .select([
        'cl.id as id',
        'cl.name as name',
        'cl.email_type as email_type',
        'cl.email_opt_in as email_opt_in',
        'cl.status',
        'cl.total_contacts',
        'u.first_name',
        'u.last_name',
        'cl.created_by',
        'cl.created_at',
      ])
      .offset((page - 1) * page_limit)
      .limit(page_limit)
      .execute();
  }

  async getAContactList(id: string) {
    return await this.db
      .selectFrom('contact_lists as cl')
      .where('cl.id', '=', id)
      .where('status', '=', 'active')
      .innerJoin('users as u', 'u.id', 'cl.created_by')
      .select([
        'cl.id',
        'cl.name',
        'cl.description',
        'cl.total_contacts',
        'cl.email_opt_in',
        'cl.email_type',
        'cl.created_by',
        'u.first_name',
        'u.last_name',
        'cl.updated_at',
        'cl.created_at',
      ])
      .executeTakeFirst();
  }

  async searchByName(query: string) {
    const searchPattern = `%${query}%`;
    return await this.db
      .selectFrom('contact_lists')
      .where(
        ({ ref }) =>
          sql<boolean>`lower(${ref('name')}) like lower(${searchPattern})`,
      )
      .where('status', '=', 'active')
      .select(['id', 'name'])
      .execute();
  }

  async createContactList(body: NewContactList) {
    return await this.db
      .insertInto('contact_lists')
      .values(body)
      .returningAll()
      .executeTakeFirst();
  }

  async updateContactList(id: string, values: UpdateContactList) {
    return await this.db
      .updateTable('contact_lists')
      .where('id', '=', id)
      .set({
        ...values,
        updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirst();
  }

  async updateContactListContactsCount(contact_list_id: string) {
    try {
      const contactsCount = await this.db

        .selectFrom('contact_list_memberships')
        .where('contact_list_id', '=', contact_list_id)
        .select(({ fn }) => [
          fn.count<number>('contact_id').as('contacts_count'),
        ])
        .executeTakeFirst();

      return await this.db
        .updateTable('contact_lists')
        .where('contact_lists.id', '=', contact_list_id)
        .set({
          total_contacts: contactsCount.contacts_count,
        })
        .returningAll()
        .executeTakeFirst();
    } catch (error) {
      this.logger.error(error);
    }
  }

  async decodeCSV(buffer: Buffer, contact_list_id: string) {
    try {
      const fileStream = new stream.Readable();
      fileStream.push(buffer);
      fileStream.push(null);

      const parser = csv.parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      let batch: NewContact[] = [];
      const batchSize = 1000;

      const processStream = new Promise((resolve, reject) => {
        fileStream
          .pipe(parser)
          .on('data', async (record) => {
            try {
              const contact = this.createContactFromRecord(record);
              batch.push(contact);

              if (batch.length > batchSize) {
                await this.insertBatch(batch, contact_list_id);
                batch = [];
              }
            } catch (error) {
              this.logger.error(`Error processing record: ${error.message}`);
            }
          })
          .on('end', async () => {
            try {
              if (batch.length > 0) {
                await this.insertBatch(batch, contact_list_id);
              }

              resolve(true);
            } catch (error) {
              reject(error);
            }
          })
          .on('error', (error) => {
            reject(error);
          });
      });

      await processStream;
      return;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  private createContactFromRecord(record: any): NewContact {
    if (!record.email) {
      throw new Error('Email is required');
    }

    return {
      id: generateUlid(),
      first_name: record.first_name || '',
      last_name: record.last_name || '',
      email: record.email.toLowerCase().trim(),
      contact: record.contact || '',
      attributes: this.parseAttributes(record),
      opt_in: record.opt_in,
      unsubscribed: record.false,
    };
  }

  private async insertBatch(
    batch: NewContact[],
    contact_list_id: string,
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const insertedContacts = await trx
        .insertInto('contacts')
        .values(batch)
        .onConflict((oc) =>
          oc.column('email').doUpdateSet({
            first_name: (eb) => eb.ref('excluded.first_name'),
            last_name: (eb) => eb.ref('excluded.last_name'),
            contact: (eb) => eb.ref('excluded.contact'),
            attributes: (eb) => eb.ref('excluded.attributes'),
            updated_at: new Date().toISOString(),
          }),
        )
        .returning(['contacts.id', 'contacts.email'])
        .execute();

      // create the junction table;
      const contactListMemberships = insertedContacts.map((contact) => ({
        contact_id: contact.id,
        contact_list_id,
        added_at: new Date(),
      }));

      await trx
        .insertInto('contact_list_memberships')
        .values(contactListMemberships)
        .onConflict((oc) =>
          oc.columns(['contact_id', 'contact_list_id']).doNothing(),
        )
        .execute();
    });
  }

  private parseAttributes(record: any): object {
    const attributes = {};
    const excludedFields = [
      'first_name',
      'last_name',
      'email',
      'contact',
      'opt_in',
    ];

    for (const [key, value] of Object.entries(record)) {
      if (!excludedFields.includes(key)) {
        attributes[key] = value;
      }
    }
    return attributes;
  }

  async archiveLists(contact_list_ids: string, project_id: string) {
    const ids = contact_list_ids.split(',');
    return await this.db
      .updateTable('contact_lists')
      .where('project_id', '=', project_id)
      .where('id', 'in', ids)
      .set({
        status: 'archive',
      })
      .returning('id')
      .execute();
  }

  async deleteContactList(contact_list_id: string) {
    const deletedMemberships = await this.db
      .deleteFrom('contact_list_memberships')
      .returningAll()
      .execute();

    const deletedList = await this.db
      .deleteFrom('contact_lists')
      .where('contact_lists.id', '=', contact_list_id)
      .execute();

    return { deletedList, deletedMemberships };
  }
}
