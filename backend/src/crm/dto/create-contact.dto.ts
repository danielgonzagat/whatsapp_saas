import { UpsertContactDto } from './upsert-contact.dto';
/** Create contact dto — derives from the canonical UpsertContactDto to prevent drift. */
export class CreateContactDto extends UpsertContactDto {}
